import type { Metadata } from "next";
import { PricingCards } from "@/components/marketing/pricing-cards";
import { TRIAL_DAYS } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Pricing",
  description: `Simple monthly pricing for QuoteFlow. Starter £39, Growth £79, Pro £149. ${TRIAL_DAYS}-day free trial, no card needed.`,
  alternates: { canonical: "/pricing" },
};

const faqs = [
  ["How does the free trial work?", `You get ${TRIAL_DAYS} days with Growth features. No card is needed. Choose a plan any time before the trial ends to keep your follow-ups running.`],
  ["What counts as an active quote?", "Any quote that's new, being followed up, paused or awaiting your response after a reply. Won and lost quotes don't count."],
  ["Can I change plans?", "Yes — upgrade or downgrade at any time from Settings → Billing. Changes are prorated automatically."],
  ["Can I cancel?", "Yes. Cancel any time and your plan stays active until the end of the billing period."],
  ["Do follow-ups come from my own email?", "Yes, when you connect Gmail or Outlook, follow-ups are sent from your own address so replies land in your normal inbox."],
  ["Is VAT included?", "Prices are shown excluding VAT. VAT is added at checkout where applicable."],
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-ink-900 sm:text-5xl">Pricing that pays for itself</h1>
        <p className="mt-4 text-lg text-ink-600">Win one extra job and QuoteFlow has paid for itself for the year. Start with a {TRIAL_DAYS}-day free trial.</p>
      </div>
      <div className="mt-12">
        <PricingCards />
      </div>
      <section className="mx-auto mt-20 max-w-3xl" aria-labelledby="faq">
        <h2 id="faq" className="text-2xl font-bold text-ink-900">Questions</h2>
        <div className="mt-6 divide-y divide-ink-200 rounded-3xl border border-ink-200 bg-white">
          {faqs.map(([q, a]) => (
            <details key={q} className="group p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-ink-900 [&::-webkit-details-marker]:hidden">
                {q}
                <span className="text-xl text-ink-400 transition-transform group-open:rotate-45" aria-hidden>+</span>
              </summary>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-600">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
