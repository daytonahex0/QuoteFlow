import { Check, Mail, Send } from "lucide-react";

const steps = [
  { tag: "Quote sent", tone: "ink", title: "£2,400", sub: "Bathroom renovation", icon: Send },
  { tag: "Day 2", tone: "sky", title: "Follow-up sent", sub: "“Hi James, just checking you received our quote…”", icon: Mail },
  { tag: "Day 5", tone: "sky", title: "Follow-up sent", sub: "“Just following up on the quote…”", icon: Mail },
  { tag: "Customer replies", tone: "amber", title: "James Smith", sub: "“Yes, let’s get it booked.”", icon: Mail },
] as const;

const tones = {
  ink: "bg-ink-100 text-ink-700",
  sky: "bg-sky-50 text-sky-800",
  amber: "bg-amber-50 text-amber-800",
};

/** Illustrative hero visual — a single quote's follow-up timeline. */
export function HeroTimeline() {
  return (
    <figure className="relative mx-auto w-full max-w-sm" aria-label="Example: a £2,400 quote followed up automatically until the customer replies and the job is won">
      <div className="rounded-[28px] border border-ink-200 bg-white p-4 shadow-[var(--shadow-raised)] sm:p-5">
        <ol className="relative space-y-3">
          {steps.map((s, i) => (
            <li key={i} className="relative">
              {i > 0 && <span className="absolute -top-3 left-6 h-3 w-px bg-ink-200" aria-hidden />}
              <div className="flex gap-3 rounded-2xl border border-ink-100 bg-ink-50/60 p-3">
                <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${tones[s.tone]}`}>
                  <s.icon className="size-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${tones[s.tone]}`}>{s.tag}</p>
                  <p className="mt-1 font-semibold text-ink-900 tabular">{s.title}</p>
                  <p className="text-sm text-ink-600">{s.sub}</p>
                </div>
              </div>
            </li>
          ))}
          <li className="relative">
            <span className="absolute -top-3 left-6 h-3 w-px bg-ink-200" aria-hidden />
            <div className="flex items-center gap-3 rounded-2xl bg-brand-700 p-3 text-white">
              <span className="grid size-10 place-items-center rounded-xl bg-white/15">
                <Check className="size-5" aria-hidden />
              </span>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-brand-200">Follow-ups stopped automatically</p>
                <p className="font-semibold">Job won</p>
              </div>
            </div>
          </li>
        </ol>
      </div>
      <figcaption className="mt-3 text-center text-xs text-ink-400">Illustrative example</figcaption>
    </figure>
  );
}
