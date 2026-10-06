"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { runAction } from "@/lib/action";
import { UserError, type ActionResult } from "@/lib/errors";
import { requireOrg } from "@/lib/auth/session";
import { BUSINESS_TYPE_VALUES } from "@/lib/organisations";
import { presetSteps, TEMPLATE_STYLES } from "@/lib/sequences";

const stepSchemas = {
  1: z.object({ businessType: z.enum(BUSINESS_TYPE_VALUES), name: z.string().trim().min(1, "Enter your business name").max(120) }),
  2: z.object({ quoteSendMethod: z.enum(["gmail", "outlook", "other", "manual"]) }),
  3: z.object({ preset: z.enum(["STANDARD", "GENTLE", "PERSISTENT", "CUSTOM"]) }),
  4: z.object({ autoFollowUpDetected: z.boolean() }),
  5: z.object({ style: z.enum(Object.keys(TEMPLATE_STYLES) as [keyof typeof TEMPLATE_STYLES]) }),
} as const;

type Step = keyof typeof stepSchemas;

export async function saveOnboardingStepAction(step: Step, data: Record<string, unknown>): Promise<ActionResult> {
  return runAction("onboarding_step", async () => {
    const { org, membership } = await requireOrg({ allowIncompleteOnboarding: true });
    if (membership.role === "MEMBER") throw new UserError("Ask the account owner to finish setting up.");
    const schema = stepSchemas[step];
    if (!schema) throw new UserError("Unknown step.");
    const input = schema.parse(data) as Record<string, unknown>;
    const nextStep = Math.max(org.onboardingStep, step + 1);
    const sequence = await db.followUpSequence.findFirst({
      where: { organisationId: org.id, isDefault: true },
      include: { steps: { orderBy: { position: "asc" } } },
    });

    switch (step) {
      case 1:
        await db.organisation.update({ where: { id: org.id }, data: { businessType: input.businessType as string, name: input.name as string, onboardingStep: nextStep } });
        break;
      case 2:
        await db.organisation.update({ where: { id: org.id }, data: { quoteSendMethod: input.quoteSendMethod as string, onboardingStep: nextStep } });
        break;
      case 3: {
        if (!sequence) throw new UserError("Your default sequence is missing. Please refresh and try again.");
        const preset = input.preset as "STANDARD" | "GENTLE" | "PERSISTENT" | "CUSTOM";
        const steps = presetSteps(preset);
        await db.$transaction(async (tx) => {
          await tx.followUpStep.deleteMany({ where: { sequenceId: sequence.id } });
          await tx.followUpSequence.update({
            where: { id: sequence.id },
            data: {
              preset,
              name: preset === "CUSTOM" ? "My follow-up sequence" : `${preset.charAt(0)}${preset.slice(1).toLowerCase()} follow-up`,
              steps: { create: steps.map((s, i) => ({ position: i + 1, delayDays: s.delayDays, subject: s.subject, body: s.body })) },
            },
          });
          await tx.organisation.update({ where: { id: org.id }, data: { onboardingStep: nextStep } });
        });
        break;
      }
      case 4:
        await db.organisation.update({ where: { id: org.id }, data: { autoFollowUpDetected: input.autoFollowUpDetected as boolean, onboardingStep: nextStep } });
        break;
      case 5: {
        if (!sequence?.steps[0]) throw new UserError("Your default sequence is missing. Please refresh and try again.");
        const style = TEMPLATE_STYLES[input.style as keyof typeof TEMPLATE_STYLES];
        await db.$transaction([
          db.followUpStep.update({ where: { id: sequence.steps[0].id }, data: { body: style.first } }),
          db.organisation.update({ where: { id: org.id }, data: { onboardingStep: 6, onboardingDoneAt: new Date() } }),
        ]);
        const preset = sequence.preset === "CUSTOM";
        redirect(preset ? `/follow-ups/${sequence.id}?welcome=1` : "/dashboard?welcome=1");
      }
    }
    return { ok: true };
  });
}

export async function goToOnboardingStepAction(step: number): Promise<ActionResult> {
  return runAction("onboarding_back", async () => {
    const { org } = await requireOrg({ allowIncompleteOnboarding: true });
    const target = Math.min(Math.max(1, Math.floor(step)), 5);
    await db.organisation.update({ where: { id: org.id }, data: { onboardingStep: target } });
  });
}
