import type { EmailAccount } from "@prisma/client";
import { db } from "../db";
import { logger } from "../logger";
import { UserError } from "../errors";
import { logActivity } from "../activity";
import { notifyOrganisation } from "../notifications";
import { assertCanAddQuote, entitlementFor } from "../billing/entitlements";
import { formatMoney } from "../money";
import { handleCustomerReply } from "../automation/replies";
import { markAccountExpired, startFollowUps } from "../automation/followups";
import { MailboxAuthError, mailboxClient, type MailMessage } from "./mailbox";
import { detectQuote, nameFromAddress } from "./detect";

const FIRST_SYNC_LOOKBACK_DAYS = 14;
const AUTO_START_MAX_AGE_DAYS = 3;
const OVERLAP_MS = 10 * 60_000;

/** Syncs one mailbox: detects customer replies first (to stop follow-ups), then new quotes. */
export async function syncEmailAccount(accountId: string, now = new Date()) {
  const lock = await db.emailAccount.updateMany({
    where: { id: accountId, status: "CONNECTED", OR: [{ syncLockedAt: null }, { syncLockedAt: { lt: new Date(now.getTime() - 10 * 60_000) } }] },
    data: { syncLockedAt: now },
  });
  if (lock.count === 0) return { skipped: true };
  const account = await db.emailAccount.findUniqueOrThrow({
    where: { id: accountId },
    include: { organisation: { include: { subscription: true } } },
  });
  const since = account.lastSyncedAt
    ? new Date(account.lastSyncedAt.getTime() - OVERLAP_MS)
    : new Date(account.connectedAt.getTime() - FIRST_SYNC_LOOKBACK_DAYS * 86400_000);

  try {
    const client = mailboxClient(account);
    // Quotes first, so replies to a quote found in this same sync stop it immediately.
    let detected = 0;
    if (entitlementFor(account.organisation.subscription, now).active) {
      detected = await detectQuotes(account, await client.listSentSince(since), account.organisation.name, now);
    }
    const replies = await detectReplies(account, await client.listInboxSince(since));
    await db.emailAccount.update({
      where: { id: account.id },
      data: { lastSyncedAt: now, syncLockedAt: null, lastError: null },
    });
    logger.info("email_sync.completed", { organisationId: account.organisationId, emailAccountId: account.id, replies, detected });
    return { replies, detected };
  } catch (error) {
    await db.emailAccount.update({ where: { id: account.id }, data: { syncLockedAt: null } });
    if (error instanceof MailboxAuthError) {
      await markAccountExpired(account, error.message);
      return { expired: true };
    }
    logger.error("email_sync.failed", { organisationId: account.organisationId, emailAccountId: account.id, error });
    await db.emailAccount.update({ where: { id: account.id }, data: { lastError: "Last sync failed — we'll retry automatically." } });
    return { error: true };
  }
}

async function detectReplies(account: EmailAccount, inbox: MailMessage[]) {
  if (!inbox.length) return 0;
  const openQuotes = await db.quote.findMany({
    where: { organisationId: account.organisationId, status: { in: ["NEW", "FOLLOWING_UP", "PAUSED", "REPLIED"] } },
    include: { customer: true },
  });
  if (!openQuotes.length) return 0;
  let count = 0;
  for (const msg of inbox.sort((a, b) => a.date.getTime() - b.date.getTime())) {
    const from = msg.from?.email;
    if (!from || from === account.email.toLowerCase()) continue;
    const byThread = msg.threadId ? openQuotes.filter((q) => q.sourceThreadId === msg.threadId && q.emailAccountId === account.id) : [];
    const byCustomer = openQuotes.filter((q) => q.customer.email === from && q.sentAt <= msg.date);
    const matches = byThread.length ? [...new Set([...byThread, ...byCustomer])] : byCustomer;
    for (const quote of matches) {
      const { newReply } = await handleCustomerReply({
        organisationId: account.organisationId,
        quoteId: quote.id,
        source: "mailbox",
        message: {
          providerMessageId: matches.length > 1 ? `${msg.id}#${quote.id}` : msg.id,
          threadId: msg.threadId,
          fromEmail: from,
          fromName: msg.from?.name ?? null,
          toEmail: account.email,
          subject: msg.subject,
          text: msg.text,
          date: msg.date,
          emailAccountId: account.id,
        },
      });
      if (newReply) count++;
    }
  }
  return count;
}

async function isOwnFollowUp(organisationId: string, msg: MailMessage, recipient: string) {
  const window = 15 * 60_000;
  const match = await db.emailMessage.findFirst({
    where: {
      organisationId,
      direction: "OUTBOUND",
      kind: "FOLLOW_UP",
      toEmail: recipient,
      sentAt: { gte: new Date(msg.date.getTime() - window), lte: new Date(msg.date.getTime() + window) },
    },
    select: { id: true },
  });
  return Boolean(match);
}

async function detectQuotes(account: EmailAccount, sent: MailMessage[], businessName: string, now: Date) {
  let created = 0;
  for (const msg of sent.sort((a, b) => a.date.getTime() - b.date.getTime())) {
    const orgId = account.organisationId;
    const known = await db.emailMessage.findFirst({ where: { organisationId: orgId, providerMessageId: msg.id }, select: { id: true } });
    if (known) continue;
    if (await db.quote.findFirst({ where: { organisationId: orgId, sourceMessageId: msg.id }, select: { id: true } })) continue;
    if (msg.threadId && (await db.quote.findFirst({ where: { organisationId: orgId, sourceThreadId: msg.threadId }, select: { id: true } }))) continue;

    const detected = detectQuote(msg, account.email, businessName);
    if (!detected) continue;
    if (await isOwnFollowUp(orgId, msg, detected.recipient.email)) continue;

    try {
      await assertCanAddQuote(orgId);
    } catch (error) {
      if (error instanceof UserError) {
        await notifyOrganisation({
          organisationId: orgId,
          type: "BILLING",
          title: "A new quote wasn't added",
          body: `We found a quote to ${detected.recipient.email} but ${error.message.charAt(0).toLowerCase()}${error.message.slice(1)}`,
          href: "/settings/billing",
        });
        return created;
      }
      throw error;
    }

    const customer = await db.customer.upsert({
      where: { organisationId_email: { organisationId: orgId, email: detected.recipient.email } },
      create: { organisationId: orgId, email: detected.recipient.email, name: nameFromAddress(detected.recipient) },
      update: {},
    });
    let quoteId: string;
    try {
      const quote = await db.$transaction(async (tx) => {
        const q = await tx.quote.create({
          data: {
            organisationId: orgId,
            customerId: customer.id,
            emailAccountId: account.id,
            description: detected.description,
            amountPence: detected.amountPence,
            sentAt: msg.date,
            status: "NEW",
            source: account.provider === "GMAIL" ? "GMAIL" : "OUTLOOK",
            sourceMessageId: msg.id,
            sourceThreadId: msg.threadId,
            sourceSubject: msg.subject.slice(0, 500),
            sourceInternetMessageId: msg.internetMessageId,
          },
        });
        const conversation = await tx.conversation.create({
          data: { organisationId: orgId, quoteId: q.id, customerId: customer.id, lastMessageAt: msg.date },
        });
        await tx.emailMessage.create({
          data: {
            organisationId: orgId,
            quoteId: q.id,
            conversationId: conversation.id,
            emailAccountId: account.id,
            direction: "OUTBOUND",
            kind: "QUOTE",
            providerMessageId: msg.id,
            threadId: msg.threadId,
            fromEmail: account.email,
            toEmail: detected.recipient.email,
            subject: msg.subject.slice(0, 500),
            bodyText: msg.text.slice(0, 10_000),
            sentAt: msg.date,
          },
        });
        await tx.usageEvent.create({ data: { organisationId: orgId, type: "QUOTE_DETECTED", quoteId: q.id } });
        await logActivity(
          { organisationId: orgId, quoteId: q.id, type: "quote.detected", message: `Quote detected: ${customer.name} — ${formatMoney(detected.amountPence)}` },
          tx,
        );
        return q;
      });
      quoteId = quote.id;
    } catch (error) {
      // Unique constraint: another sync already created this quote.
      if ((error as { code?: string }).code === "P2002") continue;
      throw error;
    }
    created++;

    const org = await db.organisation.findUniqueOrThrow({ where: { id: orgId } });
    const recent = now.getTime() - msg.date.getTime() < AUTO_START_MAX_AGE_DAYS * 86400_000;
    if (org.autoFollowUpDetected && recent) {
      try {
        await startFollowUps(orgId, quoteId);
      } catch (error) {
        logger.warn("email_sync.autostart_failed", { organisationId: orgId, quoteId, error });
      }
    } else {
      await notifyOrganisation({
        organisationId: orgId,
        type: "QUOTE_DETECTED",
        quoteId,
        title: `New quote found: ${customer.name}`,
        body: `${detected.description} (${formatMoney(detected.amountPence)}). Review it and start follow-ups.`,
        href: `/quotes/${quoteId}`,
      });
    }
  }
  return created;
}
