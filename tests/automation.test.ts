import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailAccount } from "@prisma/client";
import type { MailboxClient, MailMessage } from "@/lib/email/mailbox";

// A controllable fake mailbox standing in for Gmail / Microsoft Graph.
const fake = {
  sent: [] as MailMessage[],
  inbox: [] as MailMessage[],
  outbox: [] as { to: string; subject: string; text: string; reply: unknown }[],
  failSend: false,
  authError: false,
};

vi.mock("@/lib/email/mailbox", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email/mailbox")>();
  const client = (): MailboxClient => ({
    async listSentSince(since) {
      if (fake.authError) throw new actual.MailboxAuthError();
      return fake.sent.filter((m) => m.date >= since);
    },
    async listInboxSince(since) {
      if (fake.authError) throw new actual.MailboxAuthError();
      return fake.inbox.filter((m) => m.date >= since);
    },
    async findReplyFrom(email, since) {
      if (fake.authError) throw new actual.MailboxAuthError();
      return fake.inbox.find((m) => m.from?.email === email && m.date >= since) ?? null;
    },
    async send(opts) {
      if (fake.authError) throw new actual.MailboxAuthError();
      if (fake.failSend) throw new Error("SMTP down");
      fake.outbox.push({ to: opts.to, subject: opts.subject, text: opts.text, reply: opts.reply });
      return { id: `sent-${fake.outbox.length}`, threadId: opts.reply?.threadId ?? `thread-${fake.outbox.length}` };
    },
  });
  return { ...actual, mailboxClient: (_a: EmailAccount) => client() };
});

const { db } = await import("@/lib/db");
const { startFollowUps, pauseFollowUps, resumeFollowUps, processDueFollowUps, claimDueFollowUps, closeQuote, sendNextFollowUpNow, flagOverdueQuotes, recoverStaleLocks } =
  await import("@/lib/automation/followups");
const { handleCustomerReply } = await import("@/lib/automation/replies");
const { syncEmailAccount } = await import("@/lib/email/sync");
const { assertCanAddQuote } = await import("@/lib/billing/entitlements");
const { syncSubscription } = await import("@/lib/billing/stripe");
const { rateLimit } = await import("@/lib/rate-limit");
const { encrypt } = await import("@/lib/crypto");
const { makeOrg, makeQuote, resetDb } = await import("./helpers");

const DAY = 86400_000;

beforeEach(async () => {
  await resetDb();
  fake.sent = [];
  fake.inbox = [];
  fake.outbox = [];
  fake.failSend = false;
  fake.authError = false;
});

afterAll(async () => {
  await db.$disconnect();
});

async function connectMailbox(organisationId: string, email = "john@abcplumbing.co.uk") {
  return db.emailAccount.create({
    data: {
      organisationId,
      provider: "GMAIL",
      email,
      accessTokenEnc: encrypt("access"),
      refreshTokenEnc: encrypt("refresh"),
      tokenExpiresAt: new Date(Date.now() + 3600_000),
      connectedAt: new Date(Date.now() - DAY),
    },
  });
}

function mail(patch: Partial<MailMessage>): MailMessage {
  return {
    id: `m-${Math.random().toString(36).slice(2)}`,
    threadId: "thread-1",
    internetMessageId: "<abc@mail>",
    from: { email: "john@abcplumbing.co.uk", name: "John" },
    to: [{ email: "james@gmail.com", name: "James Smith" }],
    subject: "Quote for bathroom renovation",
    date: new Date(),
    text: "Hi James, here's our quote. Total £2,400 inc VAT.",
    attachmentNames: [],
    quoteflowHeader: false,
    ...patch,
  };
}

describe("follow-up sequence lifecycle", () => {
  it("schedules every step, sends when due, and continues the sequence", async () => {
    const { org } = await makeOrg();
    const quote = await makeQuote(org.id, { sentAt: new Date() });
    const { scheduled } = await startFollowUps(org.id, quote.id);
    expect(scheduled).toBe(3);

    const rows = await db.scheduledFollowUp.findMany({ where: { quoteId: quote.id }, orderBy: { position: "asc" } });
    expect(rows.map((r) => r.delayDays)).toEqual([2, 5, 10]);
    expect(rows[0]!.scheduledFor.getTime()).toBeGreaterThan(Date.now() + DAY);
    expect((await db.quote.findUniqueOrThrow({ where: { id: quote.id } })).status).toBe("FOLLOWING_UP");

    // Nothing is due yet.
    expect((await processDueFollowUps()).claimed).toBe(0);

    // Day 2: first follow-up goes out (via QuoteFlow's sender — no mailbox connected).
    const r1 = await processDueFollowUps(new Date(rows[0]!.scheduledFor.getTime() + 60_000));
    expect(r1.results.sent).toBe(1);
    const sent = await db.scheduledFollowUp.findUniqueOrThrow({ where: { id: rows[0]!.id } });
    expect(sent.status).toBe("SENT");
    expect(sent.subject).toBe("Just checking you received our quote");
    const msg = await db.emailMessage.findFirstOrThrow({ where: { followUpId: rows[0]!.id } });
    expect(msg.bodyText).toContain("Hi James");
    expect(msg.bodyText).toContain("£2,400");
    expect(await db.usageEvent.count({ where: { organisationId: org.id, type: "FOLLOW_UP_SENT" } })).toBe(1);

    // nextFollowUpAt advances to step 2.
    const q = await db.quote.findUniqueOrThrow({ where: { id: quote.id } });
    expect(q.nextFollowUpAt?.getTime()).toBe(rows[1]!.scheduledFor.getTime());

    // Day 5 + Day 10.
    await processDueFollowUps(new Date(rows[2]!.scheduledFor.getTime() + 60_000));
    expect(await db.scheduledFollowUp.count({ where: { quoteId: quote.id, status: "SENT" } })).toBe(3);
    expect((await db.quote.findUniqueOrThrow({ where: { id: quote.id } })).nextFollowUpAt).toBeNull();
  });

  it("stops immediately and never sends again once the customer replies", async () => {
    const { org, user } = await makeOrg();
    const quote = await makeQuote(org.id);
    await startFollowUps(org.id, quote.id);
    const rows = await db.scheduledFollowUp.findMany({ where: { quoteId: quote.id }, orderBy: { position: "asc" } });
    await processDueFollowUps(new Date(rows[0]!.scheduledFor.getTime() + 1000));

    const { newReply } = await handleCustomerReply({
      organisationId: org.id,
      quoteId: quote.id,
      source: "inbound",
      message: { providerMessageId: "reply-1", threadId: null, fromEmail: "james@example.com", fromName: "James", toEmail: "x", subject: "Re: quote", text: "Yes, let's get it booked.\n\nOn Mon John wrote:\n> hi", date: new Date() },
    });
    expect(newReply).toBe(true);

    const q = await db.quote.findUniqueOrThrow({ where: { id: quote.id } });
    expect(q.status).toBe("REPLIED");
    expect(q.needsAttention).toBe(true);
    expect(q.nextFollowUpAt).toBeNull();
    expect(await db.scheduledFollowUp.count({ where: { quoteId: quote.id, status: "CANCELLED" } })).toBe(2);
    expect((await db.conversation.findUniqueOrThrow({ where: { quoteId: quote.id } })).needsAttention).toBe(true);
    const reply = await db.emailMessage.findFirstOrThrow({ where: { quoteId: quote.id, direction: "INBOUND" } });
    expect(reply.bodyText).toBe("Yes, let's get it booked.");

    // Owner is notified.
    const n = await db.notification.findFirstOrThrow({ where: { userId: user.id, type: "CUSTOMER_REPLIED" } });
    expect(n.href).toBe(`/quotes/${quote.id}`);

    // Even far in the future, nothing else is sent.
    const r = await processDueFollowUps(new Date(Date.now() + 60 * DAY));
    expect(r.claimed).toBe(0);
    expect(await db.scheduledFollowUp.count({ where: { quoteId: quote.id, status: "SENT" } })).toBe(1);

    // Duplicate delivery of the same reply is ignored.
    const again = await handleCustomerReply({
      organisationId: org.id,
      quoteId: quote.id,
      source: "inbound",
      message: { providerMessageId: "reply-1", threadId: null, fromEmail: "james@example.com", fromName: null, toEmail: "x", subject: "Re", text: "Yes", date: new Date() },
    });
    expect(again.newReply).toBe(false);
    expect(await db.notification.count({ where: { type: "CUSTOMER_REPLIED" } })).toBe(1);

    // Follow-ups can't be restarted after a reply.
    await expect(startFollowUps(org.id, quote.id)).rejects.toThrow(/already replied/);
  });

  it("cancels a follow-up that was claimed but the reply arrived before sending", async () => {
    const { org } = await makeOrg();
    const quote = await makeQuote(org.id);
    await startFollowUps(org.id, quote.id);
    const first = await db.scheduledFollowUp.findFirstOrThrow({ where: { quoteId: quote.id, position: 1 } });
    const at = new Date(first.scheduledFor.getTime() + 1000);
    const ids = await claimDueFollowUps(10, at);
    expect(ids).toEqual([first.id]);
    await handleCustomerReply({ organisationId: org.id, quoteId: quote.id, source: "manual" });
    const { processFollowUp } = await import("@/lib/automation/followups");
    expect(await processFollowUp(first.id, { now: at })).toBe("skipped"); // reply cancelled the claimed row
    expect(await db.emailMessage.count({ where: { quoteId: quote.id, kind: "FOLLOW_UP" } })).toBe(0);
  });

  it("does a just-in-time reply check against the mailbox before sending", async () => {
    const { org } = await makeOrg();
    const account = await connectMailbox(org.id);
    const quote = await makeQuote(org.id, { email: "james@gmail.com", sentAt: new Date(Date.now() - DAY) });
    await db.quote.update({ where: { id: quote.id }, data: { emailAccountId: account.id } });
    await startFollowUps(org.id, quote.id);
    fake.inbox = [mail({ from: { email: "james@gmail.com", name: "James" }, to: [{ email: account.email, name: null }], subject: "Re: quote", text: "Go ahead!" })];

    const first = await db.scheduledFollowUp.findFirstOrThrow({ where: { quoteId: quote.id, position: 1 } });
    const r = await processDueFollowUps(new Date(first.scheduledFor.getTime() + 1000));
    expect(r.results.cancelled).toBe(1);
    expect(fake.outbox).toHaveLength(0);
    expect((await db.quote.findUniqueOrThrow({ where: { id: quote.id } })).status).toBe("REPLIED");
  });

  it("pauses and resumes", async () => {
    const { org } = await makeOrg();
    const quote = await makeQuote(org.id);
    await startFollowUps(org.id, quote.id);
    await pauseFollowUps(org.id, quote.id);
    expect((await processDueFollowUps(new Date(Date.now() + 30 * DAY))).claimed).toBe(0);

    await resumeFollowUps(org.id, quote.id);
    const q = await db.quote.findUniqueOrThrow({ where: { id: quote.id } });
    expect(q.status).toBe("FOLLOWING_UP");
    expect(await db.scheduledFollowUp.count({ where: { quoteId: quote.id, status: "SCHEDULED" } })).toBe(3);
  });

  it("marks won/lost and cancels remaining follow-ups", async () => {
    const { org, user } = await makeOrg();
    const quote = await makeQuote(org.id);
    await startFollowUps(org.id, quote.id);
    await closeQuote(org.id, quote.id, "WON", user.id);
    const q = await db.quote.findUniqueOrThrow({ where: { id: quote.id } });
    expect(q.status).toBe("WON");
    expect(q.wonAt).not.toBeNull();
    expect(await db.scheduledFollowUp.count({ where: { quoteId: quote.id, status: "SCHEDULED" } })).toBe(0);
    expect(await db.notification.count({ where: { type: "QUOTE_WON" } })).toBe(1);
    expect(await db.activityEvent.count({ where: { quoteId: quote.id, type: "quote.won" } })).toBe(1);
  });

  it("sends the next follow-up immediately on request", async () => {
    const { org } = await makeOrg();
    const quote = await makeQuote(org.id);
    await sendNextFollowUpNow(org.id, quote.id); // NEW → starts the sequence and sends step 1
    expect(await db.scheduledFollowUp.count({ where: { quoteId: quote.id, status: "SENT" } })).toBe(1);
    expect(await db.scheduledFollowUp.count({ where: { quoteId: quote.id, status: "SCHEDULED" } })).toBe(2);
  });

  it("respects the sending window and daily cap", async () => {
    const { org } = await makeOrg();
    await db.organisation.update({ where: { id: org.id }, data: { sendingStartHour: 9, sendingEndHour: 17, sendOnWeekends: true, timezone: "Europe/London", maxDailyEmails: 1 } });
    const q1 = await makeQuote(org.id, { email: "a@example.com" });
    const q2 = await makeQuote(org.id, { email: "b@example.com" });
    await startFollowUps(org.id, q1.id);
    await startFollowUps(org.id, q2.id);
    await db.scheduledFollowUp.updateMany({ where: { position: 1 }, data: { scheduledFor: new Date("2026-10-06T07:00:00Z") } });

    // 21:00 London — outside window: deferred to 09:00 next day.
    const night = new Date("2026-10-06T20:00:00Z");
    const r1 = await processDueFollowUps(night);
    expect(r1.results.deferred).toBe(2);
    const deferred = await db.scheduledFollowUp.findFirstOrThrow({ where: { quoteId: q1.id, position: 1 } });
    expect(deferred.scheduledFor.toISOString()).toBe("2026-10-07T08:00:00.000Z");

    // 10:00 next day — only one may send (cap = 1), the other rolls to the following day.
    const r2 = await processDueFollowUps(new Date("2026-10-07T09:00:00Z"));
    expect(r2.results.sent).toBe(1);
    expect(r2.results.deferred).toBe(1);
  });

  it("retries failed sends, then fails permanently with a notification", async () => {
    const { org } = await makeOrg();
    await connectMailbox(org.id);
    const quote = await makeQuote(org.id);
    await startFollowUps(org.id, quote.id);
    fake.failSend = true;
    let at = new Date(Date.now() + 3 * DAY);
    for (let i = 0; i < 3; i++) {
      await db.scheduledFollowUp.updateMany({ where: { quoteId: quote.id, position: 1, status: "SCHEDULED" }, data: { scheduledFor: at } });
      await processDueFollowUps(at);
      at = new Date(at.getTime() + 60_000);
    }
    const row = await db.scheduledFollowUp.findFirstOrThrow({ where: { quoteId: quote.id, position: 1 } });
    expect(row.status).toBe("FAILED");
    expect(row.attempts).toBe(3);
    expect(await db.notification.count({ where: { type: "AUTOMATION_FAILED" } })).toBe(1);
  });

  it("marks the mailbox expired on auth errors and defers instead of failing", async () => {
    const { org } = await makeOrg();
    const account = await connectMailbox(org.id);
    const quote = await makeQuote(org.id);
    await db.quote.update({ where: { id: quote.id }, data: { emailAccountId: account.id } });
    await startFollowUps(org.id, quote.id);
    fake.authError = true;
    const first = await db.scheduledFollowUp.findFirstOrThrow({ where: { quoteId: quote.id, position: 1 } });
    const r = await processDueFollowUps(new Date(first.scheduledFor.getTime() + 1000));
    expect(r.results.deferred).toBe(1);
    expect((await db.emailAccount.findUniqueOrThrow({ where: { id: account.id } })).status).toBe("EXPIRED");
    expect(await db.notification.count({ where: { type: "EMAIL_CONNECTION_EXPIRED" } })).toBe(1);
    expect((await db.scheduledFollowUp.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("SCHEDULED");
  });

  it("never lets two workers claim the same follow-up", async () => {
    const { org } = await makeOrg();
    for (let i = 0; i < 5; i++) {
      const q = await makeQuote(org.id, { email: `c${i}@example.com` });
      await startFollowUps(org.id, q.id);
    }
    const at = new Date(Date.now() + 3 * DAY);
    const [a, b, c] = await Promise.all([claimDueFollowUps(5, at), claimDueFollowUps(5, at), claimDueFollowUps(5, at)]);
    const all = [...a, ...b, ...c];
    expect(all.length).toBe(5);
    expect(new Set(all).size).toBe(5);
  });

  it("recovers stale locks", async () => {
    const { org } = await makeOrg();
    const q = await makeQuote(org.id);
    await startFollowUps(org.id, q.id);
    await db.scheduledFollowUp.updateMany({ where: { quoteId: q.id, position: 1 }, data: { status: "PROCESSING", lockedAt: new Date(Date.now() - 3600_000) } });
    await recoverStaleLocks();
    expect(await db.scheduledFollowUp.count({ where: { quoteId: q.id, status: "SCHEDULED" } })).toBe(3);
  });

  it("flags overdue quotes after the final follow-up", async () => {
    const { org } = await makeOrg();
    const quote = await makeQuote(org.id);
    await startFollowUps(org.id, quote.id);
    await db.scheduledFollowUp.updateMany({ where: { quoteId: quote.id }, data: { status: "SENT", sentAt: new Date(Date.now() - 5 * DAY) } });
    expect(await flagOverdueQuotes()).toBe(1);
    expect((await db.quote.findUniqueOrThrow({ where: { id: quote.id } })).needsAttention).toBe(true);
    expect(await flagOverdueQuotes()).toBe(0);
  });
});

describe("mailbox sync", () => {
  it("detects a sent quote, starts follow-ups, sends in-thread, then detects the reply", async () => {
    const { org } = await makeOrg();
    const account = await connectMailbox(org.id);
    fake.sent = [mail({ id: "gmail-quote-1", date: new Date(Date.now() - 3600_000) })];

    const r = await syncEmailAccount(account.id);
    expect(r).toMatchObject({ detected: 1, replies: 0 });
    const quote = await db.quote.findFirstOrThrow({ where: { organisationId: org.id }, include: { customer: true } });
    expect(quote).toMatchObject({ source: "GMAIL", amountPence: 240000, description: "Bathroom renovation", status: "FOLLOWING_UP", sourceThreadId: "thread-1" });
    expect(quote.customer).toMatchObject({ email: "james@gmail.com", name: "James Smith" });

    // Syncing again doesn't duplicate.
    await db.emailAccount.update({ where: { id: account.id }, data: { syncLockedAt: null } });
    await syncEmailAccount(account.id);
    expect(await db.quote.count({ where: { organisationId: org.id } })).toBe(1);

    // Follow-up is sent as a reply in the original thread.
    const first = await db.scheduledFollowUp.findFirstOrThrow({ where: { quoteId: quote.id, position: 1 } });
    await processDueFollowUps(new Date(first.scheduledFor.getTime() + 1000));
    expect(fake.outbox).toHaveLength(1);
    expect(fake.outbox[0]!.subject).toBe("Re: Quote for bathroom renovation");
    expect(fake.outbox[0]!.reply).toMatchObject({ threadId: "thread-1" });

    // Our own follow-up appearing in Sent is not detected as a new quote.
    fake.sent.push(mail({ id: "sent-1", subject: "Re: Quote for bathroom renovation", date: new Date() }));
    // Customer replies.
    fake.inbox = [mail({ id: "in-1", from: { email: "james@gmail.com", name: "James Smith" }, to: [{ email: account.email, name: null }], subject: "Re: Quote", text: "Yes, let's get it booked.", date: new Date(Date.now() + 1000) })];
    await db.emailAccount.update({ where: { id: account.id }, data: { lastSyncedAt: new Date(Date.now() - 3600_000) } });
    const r2 = await syncEmailAccount(account.id, new Date(Date.now() + 2000));
    expect(r2).toMatchObject({ replies: 1, detected: 0 });
    const after = await db.quote.findUniqueOrThrow({ where: { id: quote.id } });
    expect(after.status).toBe("REPLIED");
    expect(await db.scheduledFollowUp.count({ where: { quoteId: quote.id, status: "SCHEDULED" } })).toBe(0);
  });

  it("leaves older detected quotes for review when auto-start is off", async () => {
    const { org } = await makeOrg();
    await db.organisation.update({ where: { id: org.id }, data: { autoFollowUpDetected: false } });
    const account = await connectMailbox(org.id);
    fake.sent = [mail({ id: "q-2", date: new Date(Date.now() - 2 * 3600_000) })];
    await syncEmailAccount(account.id);
    const quote = await db.quote.findFirstOrThrow({ where: { organisationId: org.id } });
    expect(quote.status).toBe("NEW");
    expect(await db.notification.count({ where: { type: "QUOTE_DETECTED" } })).toBe(1);
  });

  it("marks the account expired when tokens are revoked", async () => {
    const { org } = await makeOrg();
    const account = await connectMailbox(org.id);
    fake.authError = true;
    expect(await syncEmailAccount(account.id)).toEqual({ expired: true });
    expect((await db.emailAccount.findUniqueOrThrow({ where: { id: account.id } })).status).toBe("EXPIRED");
  });
});

describe("plans and billing", () => {
  it("enforces active-quote limits server-side", async () => {
    const { org } = await makeOrg({ plan: "STARTER", status: "ACTIVE" });
    for (let i = 0; i < 30; i++) await makeQuote(org.id, { email: `l${i}@example.com` });
    await expect(assertCanAddQuote(org.id)).rejects.toThrow(/limit of 30/);
    // Closing a quote frees a slot.
    const one = await db.quote.findFirstOrThrow({ where: { organisationId: org.id } });
    await closeQuote(org.id, one.id, "LOST");
    await expect(assertCanAddQuote(org.id)).resolves.toBeTruthy();
  });

  it("blocks new quotes and sending when the trial has expired", async () => {
    const { org } = await makeOrg({ status: "TRIALING", trialEndsAt: new Date(Date.now() - DAY) });
    await expect(assertCanAddQuote(org.id)).rejects.toThrow(/trial has ended/);
    const quote = await makeQuote(org.id);
    await startFollowUps(org.id, quote.id);
    const first = await db.scheduledFollowUp.findFirstOrThrow({ where: { quoteId: quote.id, position: 1 } });
    const r = await processDueFollowUps(new Date(first.scheduledFor.getTime() + 1000));
    expect(r.results.deferred).toBe(1);
    expect(await db.scheduledFollowUp.count({ where: { status: "SENT" } })).toBe(0);
  });

  it("syncs Stripe subscription state into the database", async () => {
    const { org } = await makeOrg();
    const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86400;
    await syncSubscription({
      id: "sub_123",
      customer: "cus_123",
      status: "active",
      metadata: { organisationId: org.id },
      cancel_at_period_end: false,
      trial_end: null,
      items: { data: [{ price: { id: "price_pro" }, current_period_end: periodEnd }] },
    } as never);
    const sub = await db.subscription.findUniqueOrThrow({ where: { organisationId: org.id } });
    expect(sub).toMatchObject({ plan: "PRO", status: "ACTIVE", stripeSubscriptionId: "sub_123", stripeCustomerId: "cus_123" });
    expect(sub.currentPeriodEnd?.getTime()).toBe(periodEnd * 1000);

    await syncSubscription({ id: "sub_123", customer: "cus_123", status: "past_due", metadata: {}, cancel_at_period_end: false, trial_end: null, items: { data: [{ price: { id: "price_pro" } }] } } as never);
    const pastDue = await db.subscription.findUniqueOrThrow({ where: { organisationId: org.id } });
    expect(pastDue.status).toBe("PAST_DUE");
    expect(pastDue.paymentFailedAt).not.toBeNull();
  });
});

describe("organisation isolation", () => {
  it("never lets one organisation act on another's quotes", async () => {
    const a = await makeOrg();
    const b = await makeOrg();
    const quoteB = await makeQuote(b.org.id);
    await expect(startFollowUps(a.org.id, quoteB.id)).rejects.toThrow(/not found/i);
    await expect(pauseFollowUps(a.org.id, quoteB.id)).rejects.toThrow(/not found/i);
    await expect(closeQuote(a.org.id, quoteB.id, "WON")).rejects.toThrow(/not found/i);
    await expect(sendNextFollowUpNow(a.org.id, quoteB.id)).rejects.toThrow(/not found/i);
    expect(await handleCustomerReply({ organisationId: a.org.id, quoteId: quoteB.id, source: "manual" })).toEqual({ newReply: false });
    expect((await db.quote.findUniqueOrThrow({ where: { id: quoteB.id } })).status).toBe("NEW");
  });

  it("only matches replies to the mailbox owner's own organisation", async () => {
    const a = await makeOrg();
    const b = await makeOrg();
    const accountA = await connectMailbox(a.org.id, "a@a.co.uk");
    const quoteB = await makeQuote(b.org.id, { email: "james@gmail.com", sentAt: new Date(Date.now() - DAY) });
    await startFollowUps(b.org.id, quoteB.id);
    fake.inbox = [mail({ from: { email: "james@gmail.com", name: null }, to: [{ email: "a@a.co.uk", name: null }] })];
    await syncEmailAccount(accountA.id);
    expect((await db.quote.findUniqueOrThrow({ where: { id: quoteB.id } })).status).toBe("FOLLOWING_UP");
  });
});

describe("rate limiting", () => {
  it("limits within a window", async () => {
    const key = `t:${Math.random()}`;
    expect(await rateLimit(key, 2, 60)).toBe(true);
    expect(await rateLimit(key, 2, 60)).toBe(true);
    expect(await rateLimit(key, 2, 60)).toBe(false);
  });
});
