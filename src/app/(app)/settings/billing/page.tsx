import type { Metadata } from "next";
import { DateTime } from "luxon";
import { Check, Info } from "lucide-react";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { countActiveQuotes, entitlementFor } from "@/lib/billing/entitlements";
import { integrations } from "@/lib/env";
import { PLANS, PLAN_ORDER } from "@/lib/plans";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FlashToast } from "@/components/ui/toast";
import { BillingButtons, PlanButton } from "@/components/app/settings-forms";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Billing" };

const STATE_LABEL = {
  trialing: { label: "Free trial", tone: "info" as const },
  active: { label: "Active", tone: "brand" as const },
  past_due: { label: "Payment failed", tone: "warning" as const },
  trial_expired: { label: "Trial ended", tone: "danger" as const },
  inactive: { label: "Inactive", tone: "danger" as const },
};

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const { checkout } = await searchParams;
  const { org, membership } = await requireOrg();
  const sub = org.subscription;
  const ent = entitlementFor(sub);
  const [active, sentThisMonth] = await Promise.all([
    countActiveQuotes(org.id),
    db.usageEvent.count({ where: { organisationId: org.id, type: "FOLLOW_UP_SENT", createdAt: { gte: DateTime.now().setZone(org.timezone).startOf("month").toJSDate() } } }),
  ]);
  const configured = integrations.stripeConfigured();
  const canManage = membership.role !== "MEMBER";
  const paid = Boolean(sub?.stripeSubscriptionId) && ["ACTIVE", "TRIALING", "PAST_DUE"].includes(sub!.status);
  const limit = ent.limits.activeQuotes;
  const pct = Number.isFinite(limit) ? Math.min(100, Math.round((active / limit) * 100)) : 0;
  const fmt = (d: Date) => DateTime.fromJSDate(d, { zone: org.timezone }).toFormat("d LLLL yyyy");

  return (
    <div className="space-y-6">
      {checkout === "success" && <FlashToast kind="success" message="Thanks! Your subscription is being activated — this can take a few seconds." />}
      {checkout === "cancelled" && <FlashToast kind="info" message="Checkout cancelled. Nothing was charged." />}
      <Card>
        <CardHeader title="Current plan" action={<Badge tone={STATE_LABEL[ent.state].tone}>{STATE_LABEL[ent.state].label}</Badge>} />
        <CardBody className="space-y-4">
          <div>
            <p className="text-2xl font-bold text-ink-900">{PLANS[ent.plan].name}{ent.state === "trialing" && !sub?.stripeSubscriptionId ? " (trial)" : ""}</p>
            <p className="text-[15px] text-ink-600">
              {ent.state === "trialing" && sub?.trialEndsAt && `Trial ends ${fmt(sub.trialEndsAt)}${ent.trialDaysLeft != null ? ` · ${ent.trialDaysLeft} day${ent.trialDaysLeft === 1 ? "" : "s"} left` : ""}.`}
              {ent.state === "active" && sub?.currentPeriodEnd && (sub.cancelAtPeriodEnd ? `Ends on ${fmt(sub.currentPeriodEnd)}. You won't be charged again.` : `£${PLANS[ent.plan].pricePerMonth}/month · renews ${fmt(sub.currentPeriodEnd)}.`)}
              {ent.state === "past_due" && "Your last payment failed. Update your card to avoid interruption."}
              {ent.state === "trial_expired" && "Your trial has ended. Choose a plan to restart your follow-ups."}
              {ent.state === "inactive" && "Choose a plan to restart your follow-ups."}
            </p>
          </div>
          <div>
            <div className="flex justify-between text-sm">
              <span className="font-medium text-ink-800">Active quotes</span>
              <span className="text-ink-600 tabular">{active} / {Number.isFinite(limit) ? limit : "Unlimited"}</span>
            </div>
            {Number.isFinite(limit) && (
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuenow={active} aria-valuemin={0} aria-valuemax={limit} aria-label="Active quotes used">
                <div className={cn("h-full rounded-full", pct >= 90 ? "bg-amber-500" : "bg-brand-600")} style={{ width: `${pct}%` }} />
              </div>
            )}
            <p className="mt-2 text-sm text-ink-500">{sentThisMonth} follow-up{sentThisMonth === 1 ? "" : "s"} sent this month</p>
          </div>
          {configured && canManage && <BillingButtons hasCustomer={Boolean(sub?.stripeCustomerId)} hasSubscription={paid} cancelAtPeriodEnd={Boolean(sub?.cancelAtPeriodEnd)} isOwner={membership.role === "OWNER"} />}
        </CardBody>
      </Card>

      {!configured && (
        <div className="flex gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          <Info className="size-5 shrink-0" aria-hidden />
          <p>
            Payments aren’t connected on this server yet. To enable plans, set <code>STRIPE_SECRET_KEY</code>, <code>STRIPE_WEBHOOK_SECRET</code> and the three
            <code> STRIPE_PRICE_*</code> IDs, and point a Stripe webhook at <code>/api/webhooks/stripe</code>. Your free trial keeps working in the meantime.
          </p>
        </div>
      )}

      <section aria-labelledby="plans">
        <h2 id="plans" className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-500">Plans</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {PLAN_ORDER.map((key) => {
            const plan = PLANS[key];
            const current = paid && sub?.plan === key && !sub.cancelAtPeriodEnd;
            const upgrade = PLAN_ORDER.indexOf(key) > PLAN_ORDER.indexOf(sub?.plan ?? "STARTER");
            return (
              <div key={key} className={cn("flex flex-col rounded-[var(--radius-card)] border bg-white p-5 shadow-[var(--shadow-card)]", current ? "border-brand-600 ring-1 ring-brand-600" : "border-ink-200/70")}>
                <p className="font-bold text-ink-900">{plan.name}</p>
                <p className="mt-1"><span className="text-2xl font-bold text-ink-900">£{plan.pricePerMonth}</span><span className="text-ink-500">/month</span></p>
                <ul className="mt-3 flex-1 space-y-1.5 text-sm text-ink-700">
                  {plan.features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />{f}</li>)}
                </ul>
                <div className="mt-4">
                  {current ? (
                    <p className="flex min-h-11 items-center justify-center rounded-xl bg-brand-50 text-sm font-semibold text-brand-800">Current plan</p>
                  ) : (
                    <PlanButton
                      plan={key}
                      disabled={!configured || !canManage}
                      variant={key === "GROWTH" ? "primary" : "outline"}
                      label={paid ? (upgrade ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}`) : `Choose ${plan.name}`}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-ink-500">Prices exclude VAT. Plan changes are prorated. {!canManage && "Only the owner or an admin can change the plan."}</p>
      </section>
    </div>
  );
}
