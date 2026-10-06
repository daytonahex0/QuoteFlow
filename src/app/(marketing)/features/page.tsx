import type { Metadata } from "next";
import { BellRing, CalendarClock, CircleStop, Inbox, LayoutDashboard, PenLine, ShieldCheck, Smartphone } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Features",
  description: "Quote detection from Gmail and Outlook, automatic follow-up sequences, reply detection and a simple dashboard — everything you need to win more quoted jobs.",
  alternates: { canonical: "/features" },
};

const features = [
  { icon: Inbox, title: "Works with Gmail and Outlook", body: "Connect your inbox and QuoteFlow spots the quotes you send — customer, job and amount included. Or add quotes manually in seconds." },
  { icon: CalendarClock, title: "Follow-ups on autopilot", body: "Choose a sequence like Day 2 → Day 5 → Day 10. Emails go out during your working hours, in your time zone, from your own address." },
  { icon: CircleStop, title: "Stops the moment they reply", body: "QuoteFlow checks for a reply before every single email. As soon as a customer responds, all follow-ups stop. Guaranteed." },
  { icon: BellRing, title: "Instant reply alerts", body: "Get notified in the app and by email when a customer replies, so you can get the job booked while it's hot." },
  { icon: PenLine, title: "Your words, your tone", body: "Edit every message. Use {{customer_name}}, {{quote_amount}} and more to keep things personal. Preview before anything is sent." },
  { icon: LayoutDashboard, title: "A dashboard you'll actually use", body: "See quote value, replies, jobs won and what goes out next. No clutter, no training needed." },
  { icon: Smartphone, title: "Built for your phone", body: "Designed for checking between jobs: big buttons, simple cards and everything one thumb away." },
  { icon: ShieldCheck, title: "Private and secure", body: "UK-focused and GDPR-conscious. Mailbox tokens are encrypted, and we only read what's needed to detect quotes and replies." },
];

export default function FeaturesPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-20">
      <div className="max-w-2xl">
        <h1 className="text-4xl font-bold tracking-tight text-ink-900 sm:text-5xl">Everything you need to win the quotes you’ve already priced.</h1>
        <p className="mt-4 text-lg text-ink-600">QuoteFlow does one job and does it properly: following up on quotes, so you don’t have to.</p>
      </div>
      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        {features.map((f) => (
          <div key={f.title} className="rounded-3xl border border-ink-200/70 bg-white p-6 shadow-[var(--shadow-card)]">
            <span className="grid size-11 place-items-center rounded-2xl bg-brand-50 text-brand-700">
              <f.icon className="size-5" aria-hidden />
            </span>
            <h2 className="mt-4 text-lg font-semibold text-ink-900">{f.title}</h2>
            <p className="mt-1.5 text-[15px] leading-relaxed text-ink-600">{f.body}</p>
          </div>
        ))}
      </div>
      <div className="mt-14 rounded-3xl bg-ink-50 p-8 text-center">
        <h2 className="text-2xl font-bold text-ink-900">What QuoteFlow isn’t</h2>
        <p className="mx-auto mt-2 max-w-xl text-ink-600">
          It’s not a CRM, an invoicing tool or a marketing platform. It’s the simplest way to make sure every quote gets followed up.
        </p>
        <ButtonLink href="/signup" className="mt-6">Start free</ButtonLink>
      </div>
    </div>
  );
}
