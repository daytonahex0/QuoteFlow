import { Check } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { PLANS, PLAN_ORDER, TRIAL_DAYS } from "@/lib/plans";
import { cn } from "@/lib/cn";

export function PricingCards() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {PLAN_ORDER.map((key) => {
        const plan = PLANS[key];
        const featured = key === "GROWTH";
        return (
          <div
            key={key}
            className={cn(
              "relative flex flex-col rounded-3xl border bg-white p-6 shadow-[var(--shadow-card)]",
              featured ? "border-brand-600 ring-1 ring-brand-600" : "border-ink-200",
            )}
          >
            {featured && <span className="absolute -top-3 left-6 rounded-full bg-brand-700 px-3 py-1 text-xs font-bold text-white">Most popular</span>}
            <h3 className="text-lg font-bold text-ink-900">{plan.name}</h3>
            <p className="mt-1 text-sm text-ink-500">{plan.tagline}</p>
            <p className="mt-5 flex items-baseline gap-1">
              <span className="text-4xl font-bold tracking-tight text-ink-900">£{plan.pricePerMonth}</span>
              <span className="text-ink-500">/month</span>
            </p>
            <p className="mt-1 text-xs text-ink-400">Excl. VAT · cancel anytime</p>
            <ul className="mt-6 flex-1 space-y-3">
              {plan.features.map((f) => (
                <li key={f} className="flex gap-2.5 text-[15px] text-ink-700">
                  <Check className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
            <ButtonLink href={`/signup?plan=${key.toLowerCase()}`} variant={featured ? "primary" : "outline"} className="mt-8 w-full">
              Start {TRIAL_DAYS}-day free trial
            </ButtonLink>
          </div>
        );
      })}
    </div>
  );
}
