import type { EmailAccount, Organisation, Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { db } from "../db";
import { UserError } from "../errors";
import { logger } from "../logger";
import { hmac } from "../crypto";
import { env, integrations } from "../env";
import { logActivity } from "../activity";
import { notifyOrganisation } from "../notifications";
import { entitlementFor } from "../billing/entitlements";
import { followUpTime, isWithinSendingWindow, nextSendingTime, startOfLocalDay, type SendingWindow } from "../schedule";
import { renderTemplate, textToHtml } from "../templates";
import { formatMoney } from "../money";
import { MailboxAuthError, mailboxClient } from "../email/mailbox";
import { sendSystemEmail } from "../email/system-mailer";
import { handleCustomerReply } from "./replies";

const MAX_ATTEMPTS = 3;
const STALE_LOCK_MINUTES = 10;
const NO_SENDER = "No email account connected";

export function windowOf(org: Organisation): SendingWindow {
  return {
    timezone: org.timezone,
    sendingStartHour: org.sendingStartHour,
    sendingEndHour: org.sendingEndHour,
    sendOnWeekends: org.sendOnWeekends,
  };
}

/** The sequence a quote should use: the one given, the quote's own, or the organisation default. */
async function resolveSequence(organisationId: string, sequenceId?: string | null) {
  const include = { steps: { orderBy: { position: "asc" as const } } };
  if (sequenceId) {
    const seq = await db.followUpSequence.findFirst({ where: { id: sequenceId, organisationId }, include });
    if (seq) return seq;
  }
  const fallback =
    (await db.followUpSequence.findFirst({ where: { organisationId, isDefault: true }, include })) ??
    (await db.followUpSequence.findFirst({ where: { organisationId }, include, orderBy: { createdAt: "asc" } }));
  if (!fallback || fallback.steps.length === 0) {
    throw new UserError("Set up a follow-up sequence first (Follow-ups → Sequences).");
  }
  return fallback;
}

/**
 * Computes send times for the remaining steps. Times never go backwards and keep
 * the gap between steps, so a quote added late doesn't fire every step at once.
 */
export function planSchedule(
  sentAt: Date,
  steps: { delayDays: number }[],
  window: SendingWindow,
  now = new Date(),
  after?: { at: Date; delayDays: number } | null,
): Date[] {
  const times: Date[] = [];
  let prev = after ?? null;
  for (const step of steps) {
    let at = followUpTime(sentAt, step.delayDays, window, now);
    if (prev) {
      const gapDays = Math.max(1, step.delayDays - prev.delayDays);
      const earliest = DateTime.fromJSDate(prev.at).plus({ days: gapDays }).toJSDate();
      if (at < earliest) {
        const day = DateTime.fromJSDate(earliest, { zone: window.timezone }).set({ hour: window.sendingStartHour, minute: 0, second: 0, millisecond: 0 });
        at = nextSendingTime(day.toJSDate(), window);
      }
    }
    times.push(at);
    prev = { at, delayDays: step.delayDays };
  }
  return times;
}

/**
 * Starts (or restarts) the follow-up sequence for a quote. Steps already sent are kept;
 * remaining steps are (re)scheduled. Safe to call for resume and for sequence changes.
 */
export async function startFollowUps(
  organisationId: string,
  quoteId: string,
  opts: { sequenceId?: string | null; actorUserId?: string | null; reason?: "start" | "resume" | "sequence_changed" } = {},
) {
  const quote = await db.quote.findFirst({
    where: { id: quoteId, organisationId },
    include: { customer: true, organisation: true, followUps: { where: { status: "SENT" }, orderBy: { position: "desc" } } },
  });
  if (!quote) throw new UserError("Quote not found.");
  if (["REPLIED", "WON", "LOST"].includes(quote.status)) {
    throw new UserError("This customer has already replied or the quote is closed, so follow-ups can't be started.");
  }
  const sequence = await resolveSequence(organisationId, opts.sequenceId ?? quote.sequenceId);
  const lastSent = quote.followUps[0];
  const sentCount = lastSent?.position ?? 0;
  const remaining = sequence.steps.filter((s) => s.position > sentCount);
  const now = new Date();
  const times = planSchedule(
    quote.sentAt,
    remaining,
    windowOf(quote.organisation),
    now,
    lastSent?.sentAt ? { at: lastSent.sentAt, delayDays: lastSent.delayDays } : null,
  );

  await db.$transaction(async (tx) => {
    await tx.scheduledFollowUp.deleteMany({ where: { quoteId, organisationId, status: { in: ["SCHEDULED", "CANCELLED", "FAILED"] } } });
    if (remaining.length) {
      await tx.scheduledFollowUp.createMany({
        data: remaining.map((step, i) => ({
          organisationId,
          quoteId,
          stepId: step.id,
          position: step.position,
          delayDays: step.delayDays,
          scheduledFor: times[i]!,
        })),
      });
    }
    await tx.quote.update({
      where: { id: quoteId },
      data: {
        status: "FOLLOWING_UP",
        sequenceId: sequence.id,
        pausedAt: null,
        nextFollowUpAt: times[0] ?? null,
        overdueNotifiedAt: null,
        needsAttention: false,
      },
    });
    const type = opts.reason === "resume" ? "followups.resumed" : "followups.started";
    await logActivity(
      {
        organisationId,
        quoteId,
        actorUserId: opts.actorUserId,
        type,
        message:
          opts.reason === "resume"
            ? `Follow-ups resumed for ${quote.customer.name}`
            : opts.reason === "sequence_changed"
              ? `Follow-up sequence changed to "${sequence.name}" for ${quote.customer.name}`
              : `Follow-ups started for ${quote.customer.name}`,
      },
      tx,
    );
  });
  return { scheduled: times.length, firstAt: times[0] ?? null };
}

export async function pauseFollowUps(organisationId: string, quoteId: string, actorUserId?: string | null) {
  const quote = await db.quote.findFirst({ where: { id: quoteId, organisationId }, include: { customer: true } });
  if (!quote) throw new UserError("Quote not found.");
  if (quote.status !== "FOLLOWING_UP" && quote.status !== "NEW") throw new UserError("Only quotes being followed up can be paused.");
  await db.$transaction(async (tx) => {
    await tx.quote.update({ where: { id: quoteId }, data: { status: "PAUSED", pausedAt: new Date(), nextFollowUpAt: null } });
    await logActivity({ organisationId, quoteId, actorUserId, type: "followups.paused", message: `Follow-ups paused for ${quote.customer.name}` }, tx);
  });
}

export async function resumeFollowUps(organisationId: string, quoteId: string, actorUserId?: string | null) {
  const quote = await db.quote.findFirst({ where: { id: quoteId, organisationId } });
  if (!quote) throw new UserError("Quote not found.");
  if (quote.status !== "PAUSED") throw new UserError("This quote isn't paused.");
  return startFollowUps(organisationId, quoteId, { actorUserId, reason: "resume" });
}

/** Cancels all pending follow-ups for a quote inside an existing transaction. */
export async function cancelPendingFollowUps(tx: Prisma.TransactionClient, organisationId: string, quoteId: string) {
  await tx.scheduledFollowUp.updateMany({
    where: { quoteId, organisationId, status: { in: ["SCHEDULED", "PROCESSING"] } },
    data: { status: "CANCELLED", lockedAt: null },
  });
}

export async function closeQuote(organisationId: string, quoteId: string, outcome: "WON" | "LOST", actorUserId?: string | null) {
  const quote = await db.quote.findFirst({ where: { id: quoteId, organisationId }, include: { customer: true } });
  if (!quote) throw new UserError("Quote not found.");
  if (quote.status === outcome) return;
  const now = new Date();
  await db.$transaction(async (tx) => {
    await cancelPendingFollowUps(tx, organisationId, quoteId);
    await tx.quote.update({
      where: { id: quoteId },
      data: {
        status: outcome,
        wonAt: outcome === "WON" ? now : null,
        lostAt: outcome === "LOST" ? now : null,
        nextFollowUpAt: null,
        needsAttention: false,
      },
    });
    await tx.conversation.updateMany({ where: { quoteId, organisationId }, data: { needsAttention: false } });
    await logActivity(
      {
        organisationId,
        quoteId,
        actorUserId,
        type: outcome === "WON" ? "quote.won" : "quote.lost",
        message:
          outcome === "WON"
            ? `${formatMoney(quote.amountPence)} quote marked won — ${quote.customer.name}`
            : `Quote marked lost — ${quote.customer.name}`,
      },
      tx,
    );
  });
  if (outcome === "WON") {
    await notifyOrganisation({
      organisationId,
      type: "QUOTE_WON",
      quoteId,
      title: `Job won: ${quote.customer.name}`,
      body: `${quote.description} (${formatMoney(quote.amountPence)}) was marked as won.`,
      href: `/quotes/${quoteId}`,
    });
  }
}

/** Reopens a won/lost quote as "new" so the user can restart follow-ups if needed. */
export async function reopenQuote(organisationId: string, quoteId: string, actorUserId?: string | null) {
  const quote = await db.quote.findFirst({ where: { id: quoteId, organisationId }, include: { customer: true } });
  if (!quote) throw new UserError("Quote not found.");
  await db.$transaction(async (tx) => {
    await tx.quote.update({ where: { id: quoteId }, data: { status: "NEW", wonAt: null, lostAt: null, nextFollowUpAt: null } });
    await logActivity({ organisationId, quoteId, actorUserId, type: "quote.reopened", message: `Quote reopened — ${quote.customer.name}` }, tx);
  });
}

/** Sends the next follow-up immediately (user-initiated), ignoring the sending window. */
export async function sendNextFollowUpNow(organisationId: string, quoteId: string, actorUserId?: string | null) {
  const quote = await db.quote.findFirst({ where: { id: quoteId, organisationId } });
  if (!quote) throw new UserError("Quote not found.");
  if (quote.status === "PAUSED") throw new UserError("Resume follow-ups first, then send.");
  if (quote.status === "NEW") await startFollowUps(organisationId, quoteId, { actorUserId });
  else if (quote.status !== "FOLLOWING_UP") throw new UserError("This quote is closed or the customer has replied.");

  const next = await db.scheduledFollowUp.findFirst({
    where: { quoteId, organisationId, status: "SCHEDULED" },
    orderBy: { position: "asc" },
  });
  if (!next) throw new UserError("There are no follow-ups left in this sequence.");
  const claimed = await db.scheduledFollowUp.updateMany({
    where: { id: next.id, status: "SCHEDULED" },
    data: { status: "PROCESSING", lockedAt: new Date(), scheduledFor: new Date() },
  });
  if (claimed.count === 0) throw new UserError("That follow-up is already being sent.");
  const result = await processFollowUp(next.id, { immediate: true });
  if (result !== "sent") {
    const row = await db.scheduledFollowUp.findUnique({ where: { id: next.id } });
    throw new UserError(
      result === "cancelled"
        ? "The customer has already replied, so we stopped the follow-ups."
        : row?.lastError === NO_SENDER
          ? "Connect your email in Settings → Email so QuoteFlow can send follow-ups for you."
          : row?.lastError?.startsWith("Waiting for your email")
            ? "Your email connection needs reconnecting before we can send. Go to Settings → Email."
            : row?.lastError?.startsWith("Waiting for an active")
              ? "Your subscription isn't active. Choose a plan in Settings → Billing."
              : "We couldn't send that follow-up. We'll retry automatically shortly.",
    );
  }
}

/** Claims due follow-ups atomically so multiple workers never send the same email twice. */
export async function claimDueFollowUps(limit = 25, now = new Date()): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    UPDATE "ScheduledFollowUp" SET "status" = 'PROCESSING', "lockedAt" = ${now}, "updatedAt" = ${now}
    WHERE "id" IN (
      SELECT f."id" FROM "ScheduledFollowUp" f
      JOIN "Quote" q ON q."id" = f."quoteId"
      WHERE f."status" = 'SCHEDULED' AND f."scheduledFor" <= ${now} AND q."status" = 'FOLLOWING_UP'
      ORDER BY f."scheduledFor" ASC
      LIMIT ${limit}
      FOR UPDATE OF f SKIP LOCKED
    )
    RETURNING "id"`;
  return rows.map((r) => r.id);
}

export async function recoverStaleLocks(now = new Date()) {
  const cutoff = new Date(now.getTime() - STALE_LOCK_MINUTES * 60_000);
  const res = await db.scheduledFollowUp.updateMany({
    where: { status: "PROCESSING", lockedAt: { lt: cutoff } },
    data: { status: "SCHEDULED", lockedAt: null },
  });
  if (res.count) logger.warn("followups.stale_locks_recovered", { count: res.count });
}

export async function processDueFollowUps(now = new Date()) {
  const ids = await claimDueFollowUps(25, now);
  const results: Record<string, number> = {};
  for (const id of ids) {
    const r = await processFollowUp(id, { now });
    results[r] = (results[r] ?? 0) + 1;
  }
  return { claimed: ids.length, results };
}

async function reschedule(id: string, at: Date, lastError?: string) {
  await db.scheduledFollowUp.update({ where: { id }, data: { status: "SCHEDULED", lockedAt: null, scheduledFor: at, lastError: lastError ?? null } });
}

async function refreshNextFollowUp(quoteId: string) {
  const next = await db.scheduledFollowUp.findFirst({ where: { quoteId, status: "SCHEDULED" }, orderBy: { scheduledFor: "asc" } });
  await db.quote.update({ where: { id: quoteId }, data: { nextFollowUpAt: next?.scheduledFor ?? null } });
}

/** Whether QuoteFlow has any way to send follow-ups for this organisation right now. */
export async function canSendFollowUps(organisationId: string): Promise<boolean> {
  if (integrations.resendConfigured() || env().NODE_ENV !== "production") return true;
  return (await db.emailAccount.count({ where: { organisationId, status: "CONNECTED" } })) > 0;
}

export function replyToAddressFor(quoteId: string): string | null {
  if (!integrations.inboundConfigured()) return null;
  return `reply+${quoteId}.${hmac(`inbound:${quoteId}`).slice(0, 12)}@${env().INBOUND_DOMAIN}`;
}

export function parseReplyToAddress(address: string): string | null {
  const m = address.toLowerCase().match(/reply\+([a-z0-9]+)\.([a-z0-9_-]{12})@/i);
  if (!m) return null;
  const [, quoteId, sig] = m;
  return hmac(`inbound:${quoteId}`).slice(0, 12).toLowerCase() === sig!.toLowerCase() ? quoteId! : null;
}

export type ProcessResult = "sent" | "cancelled" | "deferred" | "failed" | "skipped";

/**
 * Sends one claimed follow-up. Re-checks every safety condition immediately before
 * sending — above all, that the customer hasn't replied.
 */
export async function processFollowUp(id: string, opts: { immediate?: boolean; now?: Date } = {}): Promise<ProcessResult> {
  const now = opts.now ?? new Date();
  const row = await db.scheduledFollowUp.findUnique({
    where: { id },
    include: {
      step: true,
      quote: { include: { customer: true, emailAccount: true, organisation: { include: { subscription: true } } } },
    },
  });
  if (!row || row.status !== "PROCESSING") return "skipped";
  const { quote } = row;
  const org = quote.organisation;
  const window = windowOf(org);

  // 1. Quote must still be actively following up, and never after a reply.
  if (quote.status !== "FOLLOWING_UP" || quote.repliedAt) {
    if (quote.status === "PAUSED") await reschedule(id, row.scheduledFor);
    else await db.scheduledFollowUp.update({ where: { id }, data: { status: "CANCELLED", lockedAt: null } });
    return quote.status === "PAUSED" ? "deferred" : "cancelled";
  }
  if (!row.step) {
    await db.scheduledFollowUp.update({ where: { id }, data: { status: "CANCELLED", lockedAt: null, lastError: "Sequence step was deleted" } });
    await refreshNextFollowUp(quote.id);
    return "cancelled";
  }

  // 2. Subscription must be active.
  if (!entitlementFor(org.subscription, now).active) {
    await reschedule(id, new Date(now.getTime() + 6 * 3600_000), "Waiting for an active subscription");
    return "deferred";
  }

  // 3. Respect sending hours and the daily cap (unless the user pressed "send now").
  if (!opts.immediate) {
    if (!isWithinSendingWindow(now, window)) {
      await reschedule(id, nextSendingTime(now, window));
      return "deferred";
    }
    const sentToday = await db.usageEvent.count({
      where: { organisationId: org.id, type: "FOLLOW_UP_SENT", createdAt: { gte: startOfLocalDay(now, org.timezone) } },
    });
    if (sentToday >= org.maxDailyEmails) {
      const tomorrow = DateTime.fromJSDate(now, { zone: org.timezone }).plus({ days: 1 }).startOf("day").toJSDate();
      await reschedule(id, nextSendingTime(tomorrow, window), "Daily sending limit reached");
      return "deferred";
    }
  }

  // 4. Choose how to send: the mailbox the quote came from, another connected mailbox, or QuoteFlow's sender.
  let account: EmailAccount | null = null;
  if (quote.emailAccountId) {
    if (!quote.emailAccount || quote.emailAccount.status !== "CONNECTED") {
      await reschedule(id, new Date(now.getTime() + 3600_000), "Waiting for your email account to be reconnected");
      return "deferred";
    }
    account = quote.emailAccount;
  } else {
    account = await db.emailAccount.findFirst({ where: { organisationId: org.id, status: "CONNECTED" }, orderBy: { connectedAt: "asc" } });
  }
  if (!account && !integrations.resendConfigured() && env().NODE_ENV === "production") {
    return failPermanently(row.id, quote.id, org.id, quote.customer.name, NO_SENDER);
  }

  try {
    // 5. Just-in-time reply check against the live mailbox.
    if (account) {
      const reply = await mailboxClient(account).findReplyFrom(quote.customer.email, quote.sentAt);
      if (reply) {
        await handleCustomerReply({
          organisationId: org.id,
          quoteId: quote.id,
          source: "mailbox",
          message: {
            providerMessageId: reply.id,
            threadId: reply.threadId,
            fromEmail: reply.from?.email ?? quote.customer.email,
            fromName: reply.from?.name ?? null,
            toEmail: account.email,
            subject: reply.subject,
            text: reply.text,
            date: reply.date,
            emailAccountId: account.id,
          },
        });
        return "cancelled";
      }
    }

    // 6. Final re-read of quote status immediately before sending.
    const fresh = await db.quote.findUnique({ where: { id: quote.id }, select: { status: true, repliedAt: true } });
    if (!fresh || fresh.status !== "FOLLOWING_UP" || fresh.repliedAt) {
      await db.scheduledFollowUp.update({ where: { id }, data: { status: "CANCELLED", lockedAt: null } });
      return "cancelled";
    }

    const owner = await db.membership.findFirst({ where: { organisationId: org.id, role: "OWNER" }, include: { user: true } });
    const senderName = org.senderName || owner?.user.name || org.name;
    const ctx = {
      customerName: quote.customer.name,
      businessName: org.name,
      amountPence: quote.amountPence,
      description: quote.description,
      senderName,
      signature: org.signature,
    };
    const text = renderTemplate(row.step.body, ctx);
    const html = textToHtml(text);
    const replyInThread = Boolean(account && quote.sourceMessageId && quote.emailAccountId === account.id);
    const subject = replyInThread
      ? `Re: ${(quote.sourceSubject ?? "").replace(/^\s*((re|fwd?|fw)\s*:\s*)+/i, "") || renderTemplate(row.step.subject, ctx)}`
      : renderTemplate(row.step.subject, ctx);

    let providerMessageId: string | null = null;
    let threadId: string | null = null;
    let fromEmail: string;
    if (account) {
      const sent = await mailboxClient(account).send({
        to: quote.customer.email,
        toName: quote.customer.name,
        fromName: senderName,
        subject,
        text,
        html,
        followUpId: row.id,
        reply: replyInThread
          ? { messageId: quote.sourceMessageId!, threadId: quote.sourceThreadId, internetMessageId: quote.sourceInternetMessageId }
          : null,
      });
      providerMessageId = sent.id;
      threadId = sent.threadId;
      fromEmail = account.email;
    } else {
      const replyTo = replyToAddressFor(quote.id) ?? owner?.user.email;
      const sent = await sendSystemEmail({
        to: quote.customer.email,
        subject,
        text,
        html,
        fromName: `${senderName} at ${org.name}`,
        replyTo: replyTo ?? undefined,
        headers: { "X-QuoteFlow-FollowUp": row.id },
      });
      providerMessageId = sent.id ? `resend:${sent.id}` : null;
      fromEmail = env().EMAIL_FROM ?? "quoteflow";
    }

    await db.$transaction(async (tx) => {
      await tx.scheduledFollowUp.update({
        where: { id },
        data: { status: "SENT", sentAt: now, lockedAt: null, subject, attempts: { increment: 1 }, lastError: null },
      });
      const conversation = await tx.conversation.upsert({
        where: { quoteId: quote.id },
        create: { organisationId: org.id, quoteId: quote.id, customerId: quote.customerId, lastMessageAt: now },
        update: { lastMessageAt: now },
      });
      await tx.emailMessage.create({
        data: {
          organisationId: org.id,
          quoteId: quote.id,
          conversationId: conversation.id,
          emailAccountId: account?.id ?? null,
          followUpId: row.id,
          direction: "OUTBOUND",
          kind: "FOLLOW_UP",
          providerMessageId,
          threadId,
          fromEmail,
          fromName: senderName,
          toEmail: quote.customer.email,
          subject,
          bodyText: text,
          sentAt: now,
        },
      });
      await tx.usageEvent.create({ data: { organisationId: org.id, type: "FOLLOW_UP_SENT", quoteId: quote.id, createdAt: now } });
      await logActivity(
        { organisationId: org.id, quoteId: quote.id, type: "followup.sent", message: `Follow-up ${row.position} sent to ${quote.customer.name}` },
        tx,
      );
    });
    await refreshNextFollowUp(quote.id);
    logger.info("followup.sent", { organisationId: org.id, quoteId: quote.id, followUpId: id, via: account ? account.provider : "system" });
    return "sent";
  } catch (error) {
    if (error instanceof MailboxAuthError && account) {
      await markAccountExpired(account, error.message);
      await reschedule(id, new Date(now.getTime() + 3600_000), "Waiting for your email account to be reconnected");
      return "deferred";
    }
    const attempts = row.attempts + 1;
    logger.error("followup.send_failed", { organisationId: org.id, quoteId: quote.id, followUpId: id, attempts, error });
    if (attempts >= MAX_ATTEMPTS) return failPermanently(id, quote.id, org.id, quote.customer.name, "Sending failed after several attempts", attempts);
    await db.scheduledFollowUp.update({
      where: { id },
      data: {
        status: "SCHEDULED",
        lockedAt: null,
        attempts,
        lastError: "Sending failed — retrying automatically",
        scheduledFor: new Date(now.getTime() + 15 * 60_000 * 2 ** (attempts - 1)),
      },
    });
    return "failed";
  }
}

async function failPermanently(id: string, quoteId: string, organisationId: string, customerName: string, reason: string, attempts?: number): Promise<ProcessResult> {
  await db.scheduledFollowUp.update({ where: { id }, data: { status: "FAILED", lockedAt: null, lastError: reason, ...(attempts ? { attempts } : {}) } });
  await refreshNextFollowUp(quoteId);
  await logActivity({ organisationId, quoteId, type: "followup.failed", message: `Follow-up to ${customerName} failed: ${reason}` });
  await notifyOrganisation({
    organisationId,
    type: "AUTOMATION_FAILED",
    quoteId,
    title: `Follow-up to ${customerName} couldn't be sent`,
    body: `${reason}. Open the quote to retry or send it yourself.`,
    href: `/quotes/${quoteId}`,
  });
  return "failed";
}

export async function markAccountExpired(account: EmailAccount, reason: string) {
  const res = await db.emailAccount.updateMany({
    where: { id: account.id, status: "CONNECTED" },
    data: { status: "EXPIRED", lastError: reason.slice(0, 300) },
  });
  if (res.count > 0) {
    logger.warn("email_account.expired", { organisationId: account.organisationId, emailAccountId: account.id });
    await notifyOrganisation({
      organisationId: account.organisationId,
      type: "EMAIL_CONNECTION_EXPIRED",
      title: "Your email connection needs attention",
      body: `We can no longer access ${account.email}. Reconnect it so follow-ups keep sending and replies are detected.`,
      href: "/settings/email",
    });
  }
}

/** Flags quotes where the whole sequence has been sent with no reply for 3+ days. */
export async function flagOverdueQuotes(now = new Date()) {
  const cutoff = new Date(now.getTime() - 3 * 86400_000);
  const quotes = await db.quote.findMany({
    where: {
      status: "FOLLOWING_UP",
      overdueNotifiedAt: null,
      followUps: { none: { status: { in: ["SCHEDULED", "PROCESSING"] } }, some: { status: "SENT", sentAt: { lt: cutoff } } },
    },
    include: { customer: true },
    take: 100,
  });
  for (const q of quotes) {
    await db.quote.update({ where: { id: q.id }, data: { overdueNotifiedAt: now, needsAttention: true } });
    await logActivity({ organisationId: q.organisationId, quoteId: q.id, type: "quote.overdue", message: `No reply from ${q.customer.name} after the final follow-up` });
    await notifyOrganisation({
      organisationId: q.organisationId,
      type: "QUOTE_OVERDUE",
      quoteId: q.id,
      title: `${q.customer.name} hasn't replied`,
      body: `All follow-ups for "${q.description}" have been sent. It might be worth a quick call.`,
      href: `/quotes/${q.id}`,
    });
  }
  return quotes.length;
}
