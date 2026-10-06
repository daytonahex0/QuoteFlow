import type { Plan } from "@prisma/client";

/** Single source of truth for plan pricing and limits (enforced server-side). */
export const PLANS: Record<
  Plan,
  {
    name: string;
    pricePerMonth: number;
    tagline: string;
    features: string[];
    limits: {
      activeQuotes: number; // Infinity = unlimited
      sequences: number;
      stepsPerSequence: number;
      seats: number;
      analyticsDays: number; // max lookback; 0 = unlimited
      customRange: boolean;
      csvExport: boolean;
    };
  }
> = {
  STARTER: {
    name: "Starter",
    pricePerMonth: 39,
    tagline: "For sole traders getting started.",
    features: ["30 active quotes", "Basic follow-up sequences", "Gmail & Outlook integration", "Dashboard"],
    limits: { activeQuotes: 30, sequences: 1, stepsPerSequence: 3, seats: 1, analyticsDays: 30, customRange: false, csvExport: false },
  },
  GROWTH: {
    name: "Growth",
    pricePerMonth: 79,
    tagline: "For busy teams sending quotes every week.",
    features: ["100 active quotes", "Custom sequences", "Advanced analytics", "Priority support"],
    limits: { activeQuotes: 100, sequences: 5, stepsPerSequence: 6, seats: 1, analyticsDays: 365, customRange: true, csvExport: false },
  },
  PRO: {
    name: "Pro",
    pricePerMonth: 149,
    tagline: "For growing businesses with a team.",
    features: ["Unlimited active quotes", "Advanced automation", "Multiple users", "Advanced reporting & CSV export"],
    limits: { activeQuotes: Infinity, sequences: 25, stepsPerSequence: 10, seats: 10, analyticsDays: 0, customRange: true, csvExport: true },
  },
};

export const TRIAL_DAYS = 14;
/** Plan whose features are unlocked during the free trial. */
export const TRIAL_PLAN: Plan = "GROWTH";
/** Days a past-due subscription keeps working while Stripe retries payment. */
export const PAYMENT_GRACE_DAYS = 7;

export const PLAN_ORDER: Plan[] = ["STARTER", "GROWTH", "PRO"];
