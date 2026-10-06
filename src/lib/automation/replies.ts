import { db } from "../db";
import { logActivity } from "../activity";
import { notifyOrganisation } from "../notifications";
import { formatMoney } from "../money";
import { logger } from "../logger";

export type IncomingReply = {
  providerMessageId: string | null;
  threadId: string | null;
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  subject: string;
  text: string;
  date: Date;
  emailAccountId?: string | null;
};

/**
 * The single place a customer reply is recorded. Immediately stops every pending
 * follow-up for the quote, flags it for attention and notifies the business.
 * Idempotent: the same message can be processed repeatedly without side effects.
 */
export async function handleCustomerReply(input: {
  organisationId: string;
  quoteId: string;
  source: "mailbox" | "inbound" | "manual";
  message?: IncomingReply | null;
  actorUserId?: string | null;
}): Promise<{ newReply: boolean }> {
  const { organisationId, quoteId, message } = input;
  const result = await db.$transaction(async (tx) => {
    const quote = await tx.quote.findFirst({ where: { id: quoteId, organisationId }, include: { customer: true } });
    if (!quote) return null;

    if (message?.providerMessageId) {
      const existing = await tx.emailMessage.findUnique({
        where: { organisationId_providerMessageId: { organisationId, providerMessageId: message.providerMessageId } },
      });
      if (existing && existing.quoteId === quoteId) return { quote, newReply: false, duplicate: true };
    }

    const repliedAt = message?.date ?? new Date();
    const stopsFollowUps = ["NEW", "FOLLOWING_UP", "PAUSED"].includes(quote.status);

    // Stop all automation first — this is the critical guarantee.
    await tx.scheduledFollowUp.updateMany({
      where: { quoteId, organisationId, status: { in: ["SCHEDULED", "PROCESSING"] } },
      data: { status: "CANCELLED", lockedAt: null },
    });

    const conversation = await tx.conversation.upsert({
      where: { quoteId },
      create: { organisationId, quoteId, customerId: quote.customerId, needsAttention: true, lastMessageAt: repliedAt },
      update: { needsAttention: quote.status === "WON" || quote.status === "LOST" ? undefined : true, lastMessageAt: repliedAt },
    });

    if (message) {
      await tx.emailMessage.create({
        data: {
          organisationId,
          quoteId,
          conversationId: conversation.id,
          emailAccountId: message.emailAccountId ?? null,
          direction: "INBOUND",
          kind: "REPLY",
          providerMessageId: message.providerMessageId,
          threadId: message.threadId,
          fromEmail: message.fromEmail.toLowerCase(),
          fromName: message.fromName,
          toEmail: message.toEmail,
          subject: message.subject.slice(0, 500),
          bodyText: stripQuotedText(message.text).slice(0, 10_000),
          sentAt: repliedAt,
        },
      });
    }

    if (stopsFollowUps) {
      await tx.quote.update({
        where: { id: quoteId },
        data: { status: "REPLIED", repliedAt: quote.repliedAt ?? repliedAt, needsAttention: true, nextFollowUpAt: null, pausedAt: null },
      });
      await logActivity(
        {
          organisationId,
          quoteId,
          actorUserId: input.actorUserId,
          type: "customer.replied",
          message: input.source === "manual" ? `${quote.customer.name} marked as replied` : `${quote.customer.name} replied`,
        },
        tx,
      );
    } else if (quote.status === "REPLIED") {
      await tx.quote.update({ where: { id: quoteId }, data: { needsAttention: true } });
    }
    return { quote, newReply: stopsFollowUps, duplicate: false };
  });

  if (!result) return { newReply: false };
  if (result.newReply) {
    logger.info("quote.replied", { organisationId, quoteId, source: input.source });
    if (input.source !== "manual") {
      const preview = message ? stripQuotedText(message.text).replace(/\s+/g, " ").slice(0, 160) : "";
      await notifyOrganisation({
        organisationId,
        type: "CUSTOMER_REPLIED",
        quoteId,
        title: `${result.quote.customer.name} replied to your quote`,
        body: `${result.quote.description} (${formatMoney(result.quote.amountPence)}). Follow-ups have stopped.${preview ? ` “${preview}”` : ""}`,
        href: `/quotes/${quoteId}`,
      });
    }
  }
  return { newReply: result.newReply };
}

/** Removes the quoted previous message from a reply so only the customer's words are shown. */
export function stripQuotedText(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (/^\s*On .+wrote:\s*$/i.test(line) || /^-{2,}\s*Original Message/i.test(line) || /^\s*From:\s.+/i.test(line) || /^_{5,}/.test(line)) break;
    if (/^\s*>/.test(line)) continue;
    out.push(line);
  }
  return out.join("\n").trim() || text.trim();
}
