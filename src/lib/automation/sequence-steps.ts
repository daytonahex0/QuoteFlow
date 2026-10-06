import type { SequencePreset } from "@prisma/client";
import { db } from "../db";
import { logger } from "../logger";
import { startFollowUps } from "./followups";

type StepInput = { delayDays: number; subject: string; body: string };

/**
 * Replaces a sequence's steps in place (by position) so scheduled follow-ups keep
 * pointing at their step, then reschedules active quotes if timing changed.
 * Returns how many active quotes were rescheduled.
 */
export async function updateSequenceSteps(
  organisationId: string,
  sequenceId: string,
  input: { name?: string; preset?: SequencePreset; steps: StepInput[] },
): Promise<number> {
  const seq = await db.followUpSequence.findFirstOrThrow({
    where: { id: sequenceId, organisationId },
    include: { steps: { orderBy: { position: "asc" } } },
  });
  const timingChanged = seq.steps.length !== input.steps.length || seq.steps.some((s, i) => s.delayDays !== input.steps[i]?.delayDays);

  await db.$transaction(async (tx) => {
    await tx.followUpSequence.update({
      where: { id: seq.id },
      data: { name: input.name ?? seq.name, preset: input.preset ?? (timingChanged ? "CUSTOM" : seq.preset) },
    });
    for (const [i, step] of input.steps.entries()) {
      await tx.followUpStep.upsert({
        where: { sequenceId_position: { sequenceId: seq.id, position: i + 1 } },
        create: { sequenceId: seq.id, position: i + 1, ...step },
        update: step,
      });
    }
    await tx.followUpStep.deleteMany({ where: { sequenceId: seq.id, position: { gt: input.steps.length } } });
  });

  if (!timingChanged) return 0;
  const quotes = await db.quote.findMany({ where: { organisationId, sequenceId: seq.id, status: "FOLLOWING_UP" }, select: { id: true } });
  for (const q of quotes) {
    try {
      await startFollowUps(organisationId, q.id, { sequenceId: seq.id, reason: "sequence_changed" });
    } catch (error) {
      logger.warn("sequence.reschedule_failed", { organisationId, quoteId: q.id, error });
    }
  }
  return quotes.length;
}
