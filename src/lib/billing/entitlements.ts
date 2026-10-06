import type { Plan, Subscription } from "@prisma/client";
import { db } from "../db";
import { UserError } from "../errors";
import { PAYMENT_GRACE_DAYS, PLANS } from "../plans";

export type Entitlement = {
  plan: Plan;
  active: boolean; // automation may run & new quotes may be created
  state: "trialing" | "active" | "past_due" | "trial_expired" | "inactive";
  trialDaysLeft: number | null;
  limits: (typeof PLANS)[Plan]["limits"];
};

export function entitlementFor(sub: Subscription | null | undefined, now = new Date()): Entitlement {
  if (!sub) return { plan: "STARTER", active: false, state: "inactive", trialDaysLeft: null, limits: PLANS.STARTER.limits };
  const limits = PLANS[sub.plan].limits;
  switch (sub.status) {
    case "TRIALING": {
      const ends = sub.trialEndsAt ?? now;
      const left = Math.ceil((ends.getTime() - now.getTime()) / 86400_000);
      // A Stripe-managed trial (card on file) is renewed by Stripe; an app trial simply expires.
      if (ends > now || sub.stripeSubscriptionId) return { plan: sub.plan, active: true, state: "trialing", trialDaysLeft: Math.max(0, left), limits };
      return { plan: sub.plan, active: false, state: "trial_expired", trialDaysLeft: 0, limits };
    }
    case "ACTIVE":
      return { plan: sub.plan, active: true, state: "active", trialDaysLeft: null, limits };
    case "PAST_DUE": {
      const failedAt = sub.paymentFailedAt ?? sub.updatedAt;
      const withinGrace = now.getTime() - failedAt.getTime() < PAYMENT_GRACE_DAYS * 86400_000;
      return { plan: sub.plan, active: withinGrace, state: "past_due", trialDaysLeft: null, limits };
    }
    default:
      return { plan: sub.plan, active: false, state: "inactive", trialDaysLeft: null, limits };
  }
}

export async function getEntitlement(organisationId: string) {
  const sub = await db.subscription.findUnique({ where: { organisationId } });
  return entitlementFor(sub);
}

export const ACTIVE_QUOTE_STATUSES = ["NEW", "FOLLOWING_UP", "REPLIED", "PAUSED"] as const;

export async function countActiveQuotes(organisationId: string) {
  return db.quote.count({ where: { organisationId, status: { in: [...ACTIVE_QUOTE_STATUSES] } } });
}

/** Throws a friendly error if the organisation cannot add another active quote. */
export async function assertCanAddQuote(organisationId: string) {
  const ent = await getEntitlement(organisationId);
  if (!ent.active) {
    throw new UserError(
      ent.state === "trial_expired"
        ? "Your free trial has ended. Choose a plan in Settings → Billing to keep following up."
        : "Your subscription isn't active. Update billing in Settings → Billing to continue.",
      "subscription_inactive",
    );
  }
  if (Number.isFinite(ent.limits.activeQuotes)) {
    const active = await countActiveQuotes(organisationId);
    if (active >= ent.limits.activeQuotes) {
      throw new UserError(
        `You've reached your plan's limit of ${ent.limits.activeQuotes} active quotes. Mark old quotes as won or lost, or upgrade your plan.`,
        "plan_limit",
      );
    }
  }
  return ent;
}
