"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { runAction, formBool, formString } from "@/lib/action";
import { UserError, type ActionResult } from "@/lib/errors";
import { requireOrg } from "@/lib/auth/session";
import { assertCanAddQuote } from "@/lib/billing/entitlements";
import { quoteSchema, moneySchema } from "@/lib/validation";
import { logActivity } from "@/lib/activity";
import { formatMoney } from "@/lib/money";
import { audit } from "@/lib/logger";
import { closeQuote, pauseFollowUps, reopenQuote, resumeFollowUps, sendNextFollowUpNow, startFollowUps } from "@/lib/automation/followups";
import { handleCustomerReply } from "@/lib/automation/replies";

export async function createQuoteAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction("create_quote", async () => {
    const { org, user } = await requireOrg();
    const input = quoteSchema.parse({
      customerName: formString(form, "customerName"),
      customerEmail: formString(form, "customerEmail"),
      customerPhone: formString(form, "customerPhone"),
      amount: formString(form, "amount"),
      description: formString(form, "description"),
      sentAt: formString(form, "sentAt"),
      startFollowUps: formBool(form, "startFollowUps"),
      sequenceId: formString(form, "sequenceId"),
    });
    await assertCanAddQuote(org.id);
    if (input.sequenceId) {
      const seq = await db.followUpSequence.findFirst({ where: { id: input.sequenceId, organisationId: org.id }, select: { id: true } });
      if (!seq) throw new UserError("That follow-up sequence no longer exists.");
    }

    const quote = await db.$transaction(async (tx) => {
      const customer = await tx.customer.upsert({
        where: { organisationId_email: { organisationId: org.id, email: input.customerEmail } },
        create: { organisationId: org.id, email: input.customerEmail, name: input.customerName, phone: input.customerPhone || null },
        update: { name: input.customerName, ...(input.customerPhone ? { phone: input.customerPhone } : {}) },
      });
      const q = await tx.quote.create({
        data: {
          organisationId: org.id,
          customerId: customer.id,
          createdById: user.id,
          description: input.description,
          amountPence: input.amount,
          sentAt: input.sentAt,
          source: "MANUAL",
          sequenceId: input.sequenceId || null,
        },
      });
      await tx.conversation.create({ data: { organisationId: org.id, quoteId: q.id, customerId: customer.id } });
      await tx.usageEvent.create({ data: { organisationId: org.id, type: "QUOTE_CREATED", quoteId: q.id } });
      await logActivity(
        { organisationId: org.id, quoteId: q.id, actorUserId: user.id, type: "quote.created", message: `Quote added: ${customer.name} — ${formatMoney(input.amount)}` },
        tx,
      );
      return q;
    });

    if (input.startFollowUps) await startFollowUps(org.id, quote.id, { actorUserId: user.id });
    revalidatePath("/dashboard");
    redirect(`/quotes/${quote.id}?created=1`);
  });
}

const updateSchema = z.object({
  customerName: z.string().trim().min(1, "Enter the customer's name").max(120),
  customerPhone: z.string().trim().max(40).regex(/^[0-9+()\s-]*$/, "Enter a valid phone number").optional().or(z.literal("")),
  amount: moneySchema,
  description: z.string().trim().min(1, "Describe the job").max(200),
});

export async function updateQuoteAction(quoteId: string, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction("update_quote", async () => {
    const { org, user } = await requireOrg();
    const input = updateSchema.parse({
      customerName: formString(form, "customerName"),
      customerPhone: formString(form, "customerPhone"),
      amount: formString(form, "amount"),
      description: formString(form, "description"),
    });
    const quote = await db.quote.findFirst({ where: { id: quoteId, organisationId: org.id } });
    if (!quote) throw new UserError("Quote not found.");
    await db.$transaction(async (tx) => {
      await tx.quote.update({ where: { id: quote.id }, data: { description: input.description, amountPence: input.amount } });
      await tx.customer.update({ where: { id: quote.customerId }, data: { name: input.customerName, phone: input.customerPhone || null } });
      await logActivity({ organisationId: org.id, quoteId, actorUserId: user.id, type: "quote.updated", message: `Quote details updated — ${input.customerName}` }, tx);
    });
    revalidatePath(`/quotes/${quoteId}`);
    return { ok: true, message: "Quote updated." };
  });
}

const commandSchema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("start") }),
  z.object({ command: z.literal("pause") }),
  z.object({ command: z.literal("resume") }),
  z.object({ command: z.literal("won") }),
  z.object({ command: z.literal("lost") }),
  z.object({ command: z.literal("replied") }),
  z.object({ command: z.literal("reopen") }),
  z.object({ command: z.literal("send_now") }),
  z.object({ command: z.literal("acknowledge") }),
  z.object({ command: z.literal("change_sequence"), sequenceId: z.string().min(1) }),
]);

export type QuoteCommand = z.infer<typeof commandSchema>;

const MESSAGES: Record<QuoteCommand["command"], string> = {
  start: "Follow-ups started.",
  pause: "Follow-ups paused.",
  resume: "Follow-ups resumed.",
  won: "Nice one — quote marked as won.",
  lost: "Quote marked as lost. Follow-ups stopped.",
  replied: "Marked as replied. Follow-ups stopped.",
  reopen: "Quote reopened.",
  send_now: "Follow-up sent.",
  acknowledge: "Marked as handled.",
  change_sequence: "Follow-up sequence updated.",
};

export async function quoteCommandAction(quoteId: string, raw: QuoteCommand): Promise<ActionResult> {
  return runAction("quote_command", async () => {
    const { org, user } = await requireOrg();
    const cmd = commandSchema.parse(raw);
    const quote = await db.quote.findFirst({ where: { id: quoteId, organisationId: org.id }, select: { id: true, status: true } });
    if (!quote) throw new UserError("Quote not found.");

    switch (cmd.command) {
      case "start":
        await assertActiveSubscription(org.id);
        await startFollowUps(org.id, quoteId, { actorUserId: user.id });
        break;
      case "pause":
        await pauseFollowUps(org.id, quoteId, user.id);
        break;
      case "resume":
        await assertActiveSubscription(org.id);
        await resumeFollowUps(org.id, quoteId, user.id);
        break;
      case "won":
      case "lost":
        await closeQuote(org.id, quoteId, cmd.command === "won" ? "WON" : "LOST", user.id);
        break;
      case "replied":
        await handleCustomerReply({ organisationId: org.id, quoteId, source: "manual", actorUserId: user.id });
        break;
      case "reopen":
        await assertCanAddQuote(org.id);
        await reopenQuote(org.id, quoteId, user.id);
        break;
      case "send_now":
        await assertActiveSubscription(org.id);
        await sendNextFollowUpNow(org.id, quoteId, user.id);
        break;
      case "acknowledge":
        await db.$transaction([
          db.quote.update({ where: { id: quoteId }, data: { needsAttention: false } }),
          db.conversation.updateMany({ where: { quoteId, organisationId: org.id }, data: { needsAttention: false } }),
        ]);
        break;
      case "change_sequence": {
        const seq = await db.followUpSequence.findFirst({ where: { id: cmd.sequenceId, organisationId: org.id } });
        if (!seq) throw new UserError("That sequence no longer exists.");
        if (quote.status === "FOLLOWING_UP") {
          await startFollowUps(org.id, quoteId, { sequenceId: seq.id, actorUserId: user.id, reason: "sequence_changed" });
        } else {
          await db.quote.update({ where: { id: quoteId }, data: { sequenceId: seq.id } });
        }
        break;
      }
    }
    revalidatePath(`/quotes/${quoteId}`);
    revalidatePath("/dashboard");
    return { ok: true, message: MESSAGES[cmd.command] };
  });
}

async function assertActiveSubscription(organisationId: string) {
  const { getEntitlement } = await import("@/lib/billing/entitlements");
  const ent = await getEntitlement(organisationId);
  if (!ent.active) throw new UserError("Your subscription isn't active, so follow-ups can't be sent. Choose a plan in Settings → Billing.");
}

export async function deleteQuoteAction(quoteId: string): Promise<ActionResult> {
  return runAction("delete_quote", async () => {
    const { org, user } = await requireOrg();
    const res = await db.quote.deleteMany({ where: { id: quoteId, organisationId: org.id } });
    if (res.count === 0) throw new UserError("Quote not found.");
    audit("quote.deleted", { userId: user.id, organisationId: org.id, quoteId });
    revalidatePath("/quotes");
    redirect("/quotes?status=quote_deleted");
  });
}
