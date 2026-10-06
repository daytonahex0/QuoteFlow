import type { Metadata } from "next";
import { ArrowRight, BellRing, CircleStop, Inbox, Mail, MessageSquareReply, PoundSterling, Send, Trophy } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { HeroTimeline } from "@/components/marketing/hero-timeline";
import { PricingCards } from "@/components/marketing/pricing-cards";
import { TRIAL_DAYS } from "@/lib/plans";

export const metadata: Metadata = {
  title: { absolute: "QuoteFlow — Turn more quotes into booked jobs" },
  alternates: { canonical: "/" },
};

const howItWorks = [
  { icon: Inbox, title: "Connect your email", body: "Link Gmail or Outlook in two taps. Prefer not to? Add quotes manually in seconds." },
  { icon: Mail, title: "QuoteFlow detects your quotes", body: "We spot the quotes you send and pull out the customer, job and amount." },
  { icon: Send, title: "Automatic follow-ups are sent", body: "Friendly, personal emails go out on day 2, 5 and 10 — from your own inbox." },
  { icon: CircleStop, title: "When they reply, follow-up stops", body: "The moment a customer replies, chasing stops and you get a notification." },
];

const roi = [
  { value: "£42,500", label: "Quotes followed up" },
  { value: "11", label: "Customer replies" },
  { value: "4", label: "Jobs won" },
  { value: "£8,750", label: "Recovered revenue" },
];

const testimonials = [
  { quote: "Placeholder testimonial. A real customer quote about winning more jobs will go here once we have permission to publish it.", who: "Placeholder name", role: "Plumbing business" },
  { quote: "Placeholder testimonial. A real customer quote about saving time on follow-ups will go here before launch.", who: "Placeholder name", role: "Roofing contractor" },
  { quote: "Placeholder testimonial. A real customer quote about how simple QuoteFlow is to use will go here.", who: "Placeholder name", role: "Landscaping company" },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 -z-10 h-[520px] bg-gradient-to-b from-brand-50/80 to-white" aria-hidden />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 md:grid-cols-[1.15fr_1fr] md:pb-24 md:pt-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white px-3 py-1 text-sm font-medium text-brand-800">
              <span className="size-1.5 rounded-full bg-brand-500" aria-hidden /> For trades & service businesses
            </p>
            <h1 className="mt-5 text-[2.6rem] font-bold leading-[1.05] tracking-tight text-ink-900 sm:text-6xl">
              Turn more quotes into booked jobs.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-600">
              QuoteFlow automatically follows up with customers who haven’t responded to your quotes.
            </p>
            <p className="mt-3 max-w-xl text-[17px] font-medium text-ink-800">
              Connect your email. Set your follow-up sequence. QuoteFlow does the chasing.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/signup" size="lg">
                Start free <ArrowRight className="size-5" aria-hidden />
              </ButtonLink>
              <ButtonLink href="#how-it-works" size="lg" variant="outline">
                See how it works
              </ButtonLink>
            </div>
            <p className="mt-4 text-sm text-ink-500">{TRIAL_DAYS}-day free trial · No card needed · Set up in 5 minutes</p>
          </div>
          <HeroTimeline />
        </div>
      </section>

      {/* Problem */}
      <section className="border-y border-ink-100 bg-ink-50/60">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 md:py-24">
          <h2 className="text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
            You’re busy doing the work. Following up on quotes shouldn’t be another job.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-600">
            Most customers don’t say no — they just get busy and forget. When a quote goes quiet and nobody follows up, the job quietly goes to
            whoever chased. Following up by hand is easy to forget, awkward to time, and impossible to keep consistent when you’re on site all day.
          </p>
          <div className="mt-10 grid gap-3 text-left sm:grid-cols-3">
            {[
              ["Forgotten quotes", "Quotes sit unanswered in your sent folder while you’re on the next job."],
              ["Inconsistent chasing", "Some customers get three reminders, others get none."],
              ["Lost revenue", "Every unchased quote is a job you priced up and never had the chance to win."],
            ].map(([t, b]) => (
              <div key={t} className="rounded-2xl border border-ink-200/70 bg-white p-5">
                <p className="font-semibold text-ink-900">{t}</p>
                <p className="mt-1 text-[15px] text-ink-600">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-20">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-wider text-brand-700">How it works</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">Set it up once. Never chase a quote again.</h2>
          </div>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {howItWorks.map((step, i) => (
              <li key={step.title} className="rounded-3xl border border-ink-200/70 bg-white p-6 shadow-[var(--shadow-card)]">
                <div className="flex items-center justify-between">
                  <span className="grid size-11 place-items-center rounded-2xl bg-brand-50 text-brand-700">
                    <step.icon className="size-5" aria-hidden />
                  </span>
                  <span className="text-sm font-bold text-ink-300">0{i + 1}</span>
                </div>
                <h3 className="mt-5 text-lg font-semibold text-ink-900">{step.title}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-ink-600">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Dashboard preview */}
      <section className="bg-ink-900 text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 md:grid-cols-2 md:py-24">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-brand-300">Your dashboard</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">See exactly where every quote stands.</h2>
            <p className="mt-4 text-lg text-ink-300">
              Which quotes are being chased, what goes out next, and who has replied — on one simple screen built for your phone.
            </p>
            <ul className="mt-6 space-y-2 text-ink-200">
              <li className="flex gap-2"><BellRing className="size-5 text-brand-300" aria-hidden /> Instant alerts when a customer replies</li>
              <li className="flex gap-2"><MessageSquareReply className="size-5 text-brand-300" aria-hidden /> Replies land in your normal inbox</li>
              <li className="flex gap-2"><Trophy className="size-5 text-brand-300" aria-hidden /> Mark jobs won with one tap</li>
            </ul>
          </div>
          <figure>
            <div className="rounded-[28px] bg-white p-4 text-ink-900 shadow-2xl sm:p-5" aria-label="Example dashboard">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["£18,450", "Quote value"],
                  ["23", "Quotes being followed up"],
                  ["7", "Replies"],
                  ["4", "Jobs won"],
                ].map(([v, l]) => (
                  <div key={l} className="rounded-2xl bg-ink-50 p-4">
                    <p className="text-2xl font-bold tabular">{v}</p>
                    <p className="text-sm text-ink-500">{l}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 px-1 text-xs font-bold uppercase tracking-wider text-ink-400">Needs attention</p>
              <div className="mt-2 flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50/60 p-3">
                <div>
                  <p className="font-semibold">James Smith</p>
                  <p className="text-sm text-ink-600">Bathroom renovation · £3,200</p>
                </div>
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">Replied</span>
              </div>
              <div className="mt-2 flex items-center justify-between rounded-2xl border border-ink-100 p-3">
                <div>
                  <p className="font-semibold">Sarah Jones</p>
                  <p className="text-sm text-ink-600">Rewire · £1,850</p>
                </div>
                <span className="text-xs font-medium text-ink-500">Follow-up tomorrow</span>
              </div>
              <p className="mt-3 text-sm text-ink-500"><Send className="mr-1 inline size-4" aria-hidden /> 31 follow-ups sent this month</p>
            </div>
            <figcaption className="mt-3 text-center text-xs text-ink-400">Illustrative demo data — not real customer results</figcaption>
          </figure>
        </div>
      </section>

      {/* ROI */}
      <section>
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-wider text-brand-700">What it’s worth</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">One extra job a month pays for QuoteFlow many times over.</h2>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4">
            {roi.map((r) => (
              <div key={r.label} className="rounded-3xl border border-ink-200/70 bg-white p-5 shadow-[var(--shadow-card)] sm:p-6">
                <p className="text-3xl font-bold tracking-tight text-ink-900 tabular sm:text-4xl">{r.value}</p>
                <p className="mt-1 text-[15px] text-ink-500">{r.label}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 flex items-center gap-2 text-sm text-ink-500">
            <PoundSterling className="size-4" aria-hidden /> Illustrative example for a small trades business over three months. Your results will vary.
          </p>
        </div>
      </section>

      {/* Testimonials */}
      <section className="border-y border-ink-100 bg-ink-50/60">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <h2 className="text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">What customers say</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {testimonials.map((t, i) => (
              <figure key={i} className="flex flex-col rounded-3xl border border-dashed border-ink-300 bg-white p-6">
                <span className="w-fit rounded-full bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-600">Placeholder — not a real testimonial</span>
                <blockquote className="mt-4 flex-1 text-[15px] leading-relaxed text-ink-600">“{t.quote}”</blockquote>
                <figcaption className="mt-5 text-sm">
                  <span className="font-semibold text-ink-900">{t.who}</span>
                  <span className="text-ink-500"> · {t.role}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-20">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">Simple pricing</h2>
            <p className="mt-3 text-lg text-ink-600">Every plan starts with a {TRIAL_DAYS}-day free trial. No card needed to start.</p>
          </div>
          <div className="mt-10">
            <PricingCards />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 pb-16 sm:px-6 md:pb-24">
        <div className="mx-auto max-w-6xl rounded-[32px] bg-brand-800 px-6 py-12 text-center text-white sm:px-12 md:py-16">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Stop chasing. Start winning.</h2>
          <p className="mx-auto mt-3 max-w-lg text-lg text-brand-100">Set up in about five minutes. Your next follow-up could go out today.</p>
          <ButtonLink href="/signup" size="lg" variant="secondary" className="mt-8">
            Start free <ArrowRight className="size-5" aria-hidden />
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
