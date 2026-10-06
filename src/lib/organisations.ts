import type { Prisma, SequencePreset } from "@prisma/client";
import { presetSteps, type StepTemplate } from "./sequences";
import { TRIAL_DAYS, TRIAL_PLAN } from "./plans";

export const BUSINESS_TYPES = [
  { value: "plumbing", label: "Plumbing" },
  { value: "electrical", label: "Electrical" },
  { value: "roofing", label: "Roofing" },
  { value: "building", label: "Building" },
  { value: "landscaping", label: "Landscaping" },
  { value: "cleaning", label: "Cleaning" },
  { value: "decorating", label: "Decorating" },
  { value: "hvac", label: "HVAC" },
  { value: "agency", label: "Agency" },
  { value: "other", label: "Other" },
] as const;

export const BUSINESS_TYPE_VALUES = BUSINESS_TYPES.map((b) => b.value) as [string, ...string[]];

/** Creates a business with its owner, a default follow-up sequence and a free trial. */
export async function createOrganisation(
  tx: Prisma.TransactionClient,
  input: { userId: string; name: string; businessType: string },
) {
  const org = await tx.organisation.create({
    data: {
      name: input.name,
      businessType: input.businessType,
      memberships: { create: { userId: input.userId, role: "OWNER" } },
      subscription: {
        create: { plan: TRIAL_PLAN, status: "TRIALING", trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86400_000) },
      },
    },
  });
  await createSequence(tx, org.id, { name: "Standard follow-up", preset: "STANDARD", isDefault: true });
  return org;
}

export async function createSequence(
  tx: Prisma.TransactionClient,
  organisationId: string,
  input: { name: string; preset: SequencePreset; isDefault?: boolean; steps?: StepTemplate[] },
) {
  const steps = input.steps ?? presetSteps(input.preset);
  return tx.followUpSequence.create({
    data: {
      organisationId,
      name: input.name,
      preset: input.preset,
      isDefault: input.isDefault ?? false,
      steps: { create: steps.map((s, i) => ({ position: i + 1, delayDays: s.delayDays, subject: s.subject, body: s.body })) },
    },
    include: { steps: true },
  });
}
