"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/lib/action";
import { UserError, type ActionResult } from "@/lib/errors";
import { requireOrgRole } from "@/lib/auth/session";
import { integrations } from "@/lib/env";
import { cancelSubscription, checkoutOrChangePlan, portalUrl, resumeSubscription } from "@/lib/billing/stripe";
import { countActiveQuotes } from "@/lib/billing/entitlements";
import { PLANS } from "@/lib/plans";
import { db } from "@/lib/db";
import { audit } from "@/lib/logger";

function assertConfigured() {
  if (!integrations.stripeConfigured()) throw new UserError("Billing isn't connected on this server yet. See the setup notes on this page.");
}

export async function choosePlanAction(plan: "STARTER" | "GROWTH" | "PRO"): Promise<ActionResult> {
  return runAction("choose_plan", async () => {
    assertConfigured();
    const { org, user } = await requireOrgRole(["OWNER", "ADMIN"]);
    const target = z.enum(["STARTER", "GROWTH", "PRO"]).parse(plan);
    // Prevent downgrading below current usage.
    const limit = PLANS[target].limits.activeQuotes;
    const active = await countActiveQuotes(org.id);
    if (active > limit) {
      throw new UserError(`You have ${active} active quotes, more than ${PLANS[target].name} allows (${limit}). Close some quotes first.`);
    }
    if (target !== "PRO") {
      const members = await db.membership.count({ where: { organisationId: org.id } });
      if (members > PLANS[target].limits.seats) throw new UserError(`${PLANS[target].name} is for a single user. Remove team members first.`);
    }
    const url = await checkoutOrChangePlan(org.id, target, user.email);
    audit("billing.plan_change_started", { userId: user.id, organisationId: org.id, plan: target });
    if (url) redirect(url);
    revalidatePath("/settings/billing");
    return { ok: true, message: `You're now on the ${PLANS[target].name} plan.` };
  });
}

export async function openBillingPortalAction(): Promise<ActionResult> {
  return runAction("billing_portal", async () => {
    assertConfigured();
    const { org } = await requireOrgRole(["OWNER", "ADMIN"]);
    redirect(await portalUrl(org.id));
  });
}

export async function cancelSubscriptionAction(): Promise<ActionResult> {
  return runAction("cancel_subscription", async () => {
    assertConfigured();
    const { org, user } = await requireOrgRole(["OWNER"]);
    await cancelSubscription(org.id);
    audit("billing.cancelled", { userId: user.id, organisationId: org.id });
    revalidatePath("/settings/billing");
    return { ok: true, message: "Your subscription will end at the close of this billing period." };
  });
}

export async function resumeSubscriptionAction(): Promise<ActionResult> {
  return runAction("resume_subscription", async () => {
    assertConfigured();
    const { org } = await requireOrgRole(["OWNER", "ADMIN"]);
    await resumeSubscription(org.id);
    revalidatePath("/settings/billing");
    return { ok: true, message: "Welcome back — your subscription will continue." };
  });
}
