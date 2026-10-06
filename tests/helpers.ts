import { db } from "@/lib/db";
import { createOrganisation } from "@/lib/organisations";
import { randomUUID } from "node:crypto";

export async function resetDb() {
  await db.$executeRawUnsafe(`TRUNCATE "User","Organisation","WebhookEvent","RateLimit" CASCADE`);
}

export async function makeOrg(opts: { plan?: "STARTER" | "GROWTH" | "PRO"; status?: "TRIALING" | "ACTIVE" | "CANCELED" | "PAST_DUE"; trialEndsAt?: Date; sendOnWeekends?: boolean } = {}) {
  const email = `owner-${randomUUID()}@example.com`;
  const user = await db.user.create({ data: { email, name: "John Owner", emailVerifiedAt: new Date() } });
  const org = await db.$transaction((tx) => createOrganisation(tx, { userId: user.id, name: "ABC Plumbing", businessType: "plumbing" }));
  await db.organisation.update({
    where: { id: org.id },
    data: { onboardingDoneAt: new Date(), sendOnWeekends: opts.sendOnWeekends ?? true, sendingStartHour: 0, sendingEndHour: 24 },
  });
  if (opts.plan || opts.status || opts.trialEndsAt) {
    await db.subscription.update({
      where: { organisationId: org.id },
      data: { plan: opts.plan ?? "GROWTH", status: opts.status ?? "TRIALING", trialEndsAt: opts.trialEndsAt },
    });
  }
  return { user, org: await db.organisation.findUniqueOrThrow({ where: { id: org.id } }) };
}

export async function makeQuote(organisationId: string, opts: { email?: string; sentAt?: Date; amountPence?: number } = {}) {
  const customer = await db.customer.upsert({
    where: { organisationId_email: { organisationId, email: opts.email ?? "james@example.com" } },
    create: { organisationId, email: opts.email ?? "james@example.com", name: "James Smith" },
    update: {},
  });
  return db.quote.create({
    data: { organisationId, customerId: customer.id, description: "Bathroom renovation", amountPence: opts.amountPence ?? 240000, sentAt: opts.sentAt ?? new Date() },
  });
}
