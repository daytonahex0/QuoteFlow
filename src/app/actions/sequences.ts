"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { SequencePreset } from "@prisma/client";
import { db } from "@/lib/db";
import { runAction } from "@/lib/action";
import { UserError, type ActionResult } from "@/lib/errors";
import { requireOrg } from "@/lib/auth/session";
import { getEntitlement } from "@/lib/billing/entitlements";
import { sequenceSchema, emailSchema } from "@/lib/validation";
import { createSequence } from "@/lib/organisations";
import { SEQUENCE_PRESETS } from "@/lib/sequences";
import { PLANS } from "@/lib/plans";
import { startFollowUps } from "@/lib/automation/followups";
import { renderTemplate, textToHtml } from "@/lib/templates";
import { enforceRateLimit } from "@/lib/rate-limit";
import { mailboxClient, MailboxAuthError } from "@/lib/email/mailbox";
import { sendSystemEmail } from "@/lib/email/system-mailer";
import { logger } from "@/lib/logger";

/** Reschedules every active quote on a sequence after its timing changed. */
async function rescheduleQuotesOn(organisationId: string, sequenceId: string) {
  const quotes = await db.quote.findMany({ where: { organisationId, sequenceId, status: "FOLLOWING_UP" }, select: { id: true } });
  for (const q of quotes) {
    try {
      await startFollowUps(organisationId, q.id, { sequenceId, reason: "sequence_changed" });
    } catch (error) {
      logger.warn("sequence.reschedule_failed", { organisationId, quoteId: q.id, error });
    }
  }
  return quotes.length;
}

export async function saveSequenceAction(sequenceId: string, payload: unknown): Promise<ActionResult> {
  return runAction("save_sequence", async () => {
    const { org } = await requireOrg();
    const input = sequenceSchema.parse(payload);
    const ent = await getEntitlement(org.id);
    if (input.steps.length > ent.limits.stepsPerSequence) {
      throw new UserError(`Your ${PLANS[ent.plan].name} plan allows up to ${ent.limits.stepsPerSequence} follow-ups per sequence. Upgrade for more.`);
    }
    const seq = await db.followUpSequence.findFirst({ where: { id: sequenceId, organisationId: org.id }, include: { steps: { orderBy: { position: "asc" } } } });
    if (!seq) throw new UserError("Sequence not found.");

    const timingChanged =
      seq.steps.length !== input.steps.length || seq.steps.some((s, i) => s.delayDays !== input.steps[i]?.delayDays);

    await db.$transaction(async (tx) => {
      await tx.followUpSequence.update({ where: { id: seq.id }, data: { name: input.name, preset: timingChanged ? "CUSTOM" : seq.preset } });
      // Update steps in place by position so scheduled follow-ups keep pointing at them.
      for (const [i, step] of input.steps.entries()) {
        await tx.followUpStep.upsert({
          where: { sequenceId_position: { sequenceId: seq.id, position: i + 1 } },
          create: { sequenceId: seq.id, position: i + 1, delayDays: step.delayDays, subject: step.subject, body: step.body },
          update: { delayDays: step.delayDays, subject: step.subject, body: step.body },
        });
      }
      await tx.followUpStep.deleteMany({ where: { sequenceId: seq.id, position: { gt: input.steps.length } } });
    });
    const rescheduled = timingChanged ? await rescheduleQuotesOn(org.id, seq.id) : 0;
    revalidatePath("/follow-ups");
    return { ok: true, message: rescheduled ? `Saved. ${rescheduled} active quote${rescheduled === 1 ? "" : "s"} rescheduled.` : "Sequence saved." };
  });
}

export async function createSequenceAction(preset: SequencePreset): Promise<ActionResult> {
  return runAction("create_sequence", async () => {
    const { org } = await requireOrg();
    const ent = await getEntitlement(org.id);
    const count = await db.followUpSequence.count({ where: { organisationId: org.id } });
    if (count >= ent.limits.sequences) {
      throw new UserError(
        ent.plan === "STARTER"
          ? "Custom sequences are available on Growth and Pro. Upgrade in Settings → Billing."
          : `Your plan allows up to ${ent.limits.sequences} sequences.`,
      );
    }
    const name = preset === "CUSTOM" ? "Custom sequence" : SEQUENCE_PRESETS[preset].label.replace(" (recommended)", "");
    const seq = await db.$transaction((tx) => createSequence(tx, org.id, { name: `${name} sequence`, preset }));
    redirect(`/follow-ups/${seq.id}?created=1`);
  });
}

export async function setDefaultSequenceAction(sequenceId: string): Promise<ActionResult> {
  return runAction("default_sequence", async () => {
    const { org } = await requireOrg();
    const seq = await db.followUpSequence.findFirst({ where: { id: sequenceId, organisationId: org.id } });
    if (!seq) throw new UserError("Sequence not found.");
    await db.$transaction([
      db.followUpSequence.updateMany({ where: { organisationId: org.id }, data: { isDefault: false } }),
      db.followUpSequence.update({ where: { id: seq.id }, data: { isDefault: true } }),
    ]);
    revalidatePath("/follow-ups");
    return { ok: true, message: `"${seq.name}" is now your default sequence.` };
  });
}

export async function deleteSequenceAction(sequenceId: string): Promise<ActionResult> {
  return runAction("delete_sequence", async () => {
    const { org } = await requireOrg();
    const seq = await db.followUpSequence.findFirst({ where: { id: sequenceId, organisationId: org.id } });
    if (!seq) throw new UserError("Sequence not found.");
    if (seq.isDefault) throw new UserError("You can't delete your default sequence. Make another one the default first.");
    const fallback = await db.followUpSequence.findFirst({ where: { organisationId: org.id, isDefault: true } });
    if (!fallback) throw new UserError("Set a default sequence first.");
    const active = await db.quote.findMany({ where: { organisationId: org.id, sequenceId: seq.id, status: "FOLLOWING_UP" }, select: { id: true } });
    await db.quote.updateMany({ where: { organisationId: org.id, sequenceId: seq.id }, data: { sequenceId: fallback.id } });
    for (const q of active) await startFollowUps(org.id, q.id, { sequenceId: fallback.id, reason: "sequence_changed" }).catch(() => undefined);
    await db.followUpSequence.delete({ where: { id: seq.id } });
    redirect("/follow-ups?status=sequence_deleted");
  });
}

const testSchema = z.object({ subject: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(5000) });

/** Sends the rendered message to the signed-in user so they can see exactly what customers get. */
export async function sendTestEmailAction(raw: { subject: string; body: string }): Promise<ActionResult> {
  return runAction("send_test_email", async () => {
    const { org, user } = await requireOrg();
    const input = testSchema.parse(raw);
    await enforceRateLimit(`test-email:${user.id}`, 10, 3600);
    const to = emailSchema.parse(user.email);
    const ctx = {
      customerName: "James Smith",
      businessName: org.name,
      amountPence: 320000,
      description: "bathroom renovation",
      senderName: org.senderName || user.name,
      signature: org.signature,
    };
    const subject = `[Test] ${renderTemplate(input.subject, ctx)}`;
    const text = renderTemplate(input.body, ctx);
    const account = await db.emailAccount.findFirst({ where: { organisationId: org.id, status: "CONNECTED" } });
    if (account) {
      try {
        await mailboxClient(account).send({ to, toName: user.name, fromName: ctx.senderName, subject, text, html: textToHtml(text) });
        await db.usageEvent.create({ data: { organisationId: org.id, type: "TEST_EMAIL_SENT" } });
        return { ok: true, message: `Test sent from ${account.email} to ${to}.` };
      } catch (error) {
        if (error instanceof MailboxAuthError) throw new UserError("Your email connection has expired. Reconnect it in Settings → Email.");
        throw error;
      }
    }
    const result = await sendSystemEmail({ to, subject, text, fromName: `${ctx.senderName} at ${org.name}` });
    await db.usageEvent.create({ data: { organisationId: org.id, type: "TEST_EMAIL_SENT" } });
    return {
      ok: true,
      message: result.delivered ? `Test sent to ${to}.` : "Email sending isn't configured on this server yet — the test was written to the server log.",
    };
  });
}
