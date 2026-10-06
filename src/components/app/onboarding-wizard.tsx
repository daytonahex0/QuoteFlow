"use client";

import { useState, useTransition } from "react";
import { ArrowLeft, Check, CheckCircle2, Mail, PenLine } from "lucide-react";
import { saveOnboardingStepAction, goToOnboardingStepAction } from "@/app/actions/onboarding";
import { Button } from "@/components/ui/button";
import { Input, Toggle } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { GoogleIcon, MicrosoftIcon } from "@/components/auth/oauth-buttons";
import { cn } from "@/lib/cn";

type Props = {
  initialStep: number;
  firstName: string;
  businessName: string;
  businessType: string;
  quoteSendMethod: string | null;
  preset: string;
  autoFollowUp: boolean;
  businessTypes: { value: string; label: string }[];
  accounts: { email: string; provider: string; status: string }[];
  google: boolean;
  microsoft: boolean;
  styles: { key: string; label: string; description: string; preview: string }[];
};

const PRESETS = [
  { value: "STANDARD", label: "Standard", summary: "Day 2 → Day 5 → Day 10", recommended: true },
  { value: "GENTLE", label: "Gentle", summary: "Day 3 → Day 10" },
  { value: "PERSISTENT", label: "Persistent", summary: "Day 1 → Day 3 → Day 7 → Day 14" },
  { value: "CUSTOM", label: "Custom", summary: "Set your own timings after setup" },
];

const METHODS = [
  { value: "gmail", label: "Gmail", icon: <GoogleIcon /> },
  { value: "outlook", label: "Outlook", icon: <MicrosoftIcon /> },
  { value: "other", label: "Another email system", icon: <Mail className="size-5 text-ink-500" /> },
  { value: "manually", label: "Manually", icon: <PenLine className="size-5 text-ink-500" /> },
];

function Choice({ selected, onClick, children, className }: { selected: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "relative flex min-h-14 w-full items-center gap-3 rounded-2xl border bg-white px-4 py-3 text-left text-[15px] font-semibold transition-colors",
        selected ? "border-brand-600 bg-brand-50/60 text-brand-900 ring-1 ring-brand-600" : "border-ink-200 text-ink-800 hover:border-ink-300",
        className,
      )}
    >
      {children}
      {selected && <Check className="ml-auto size-5 shrink-0 text-brand-700" aria-hidden />}
    </button>
  );
}

export function OnboardingWizard(props: Props) {
  const [step, setStep] = useState(props.initialStep);
  const [businessType, setBusinessType] = useState(props.businessType === "other" && props.initialStep === 1 ? "" : props.businessType);
  const [name, setName] = useState(props.businessName);
  const [method, setMethod] = useState(props.quoteSendMethod === "manual" ? "manually" : (props.quoteSendMethod ?? ""));
  const [preset, setPreset] = useState(props.preset);
  const [auto, setAuto] = useState(props.autoFollowUp);
  const [style, setStyle] = useState("friendly");
  const [nameError, setNameError] = useState<string>();
  const [pending, start] = useTransition();
  const toast = useToast();

  const save = (s: 1 | 2 | 3 | 4 | 5, data: Record<string, unknown>) =>
    start(async () => {
      const r = await saveOnboardingStepAction(s, data);
      if (r && !r.ok) {
        if (r.fieldErrors?.name) setNameError(r.fieldErrors.name);
        toast.error(r.error);
        return;
      }
      setStep(s + 1);
      window.scrollTo({ top: 0 });
    });

  const back = () => {
    const target = Math.max(1, step - 1);
    setStep(target);
    start(async () => {
      await goToOnboardingStepAction(target);
    });
  };

  const connected = props.accounts.filter((a) => a.status === "CONNECTED");
  const returnTo = "/onboarding";

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-ink-700">Step {step} of 5</span>
          {step > 1 && (
            <button type="button" onClick={back} className="inline-flex min-h-11 items-center gap-1 font-semibold text-ink-500 hover:text-ink-800" disabled={pending}>
              <ArrowLeft className="size-4" aria-hidden /> Back
            </button>
          )}
        </div>
        <div className="mt-2 grid grid-cols-5 gap-1.5" aria-hidden>
          {[1, 2, 3, 4, 5].map((i) => (
            <span key={i} className={cn("h-1.5 rounded-full", i <= step ? "bg-brand-600" : "bg-ink-200")} />
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-ink-200/70 bg-white p-5 shadow-[var(--shadow-card)] sm:p-8">
        {step === 1 && (
          <section aria-labelledby="s1">
            <h1 id="s1" className="text-2xl font-bold tracking-tight text-ink-900">Welcome{props.firstName ? `, ${props.firstName}` : ""}! What type of business do you run?</h1>
            <p className="mt-1 text-[15px] text-ink-500">We’ll tailor your follow-ups to suit.</p>
            <div className="mt-5" role="radiogroup" aria-label="Business type">
              <div className="grid grid-cols-2 gap-2">
                {props.businessTypes.map((b) => (
                  <Choice key={b.value} selected={businessType === b.value} onClick={() => setBusinessType(b.value)}>{b.label}</Choice>
                ))}
              </div>
            </div>
            <Input className="mt-5" label="Business name" value={name} onChange={(e) => { setName(e.target.value); setNameError(undefined); }} maxLength={120} error={nameError} />
            <Button size="lg" className="mt-6 w-full" disabled={!businessType || !name.trim()} loading={pending} onClick={() => save(1, { businessType, name })}>Continue</Button>
          </section>
        )}

        {step === 2 && (
          <section aria-labelledby="s2">
            <h1 id="s2" className="text-2xl font-bold tracking-tight text-ink-900">How do you currently send quotes?</h1>
            <p className="mt-1 text-[15px] text-ink-500">This helps us set up the right connection.</p>
            <div className="mt-5 grid gap-2" role="radiogroup" aria-label="How you send quotes">
              {METHODS.map((m) => (
                <Choice key={m.value} selected={method === m.value} onClick={() => setMethod(m.value)}>
                  <span className="grid size-8 place-items-center">{m.icon}</span> {m.label}
                </Choice>
              ))}
            </div>
            <Button size="lg" className="mt-6 w-full" disabled={!method} loading={pending} onClick={() => save(2, { quoteSendMethod: method === "manually" ? "manual" : method })}>Continue</Button>
          </section>
        )}

        {step === 3 && (
          <section aria-labelledby="s3">
            <h1 id="s3" className="text-2xl font-bold tracking-tight text-ink-900">How quickly should QuoteFlow follow up?</h1>
            <p className="mt-1 text-[15px] text-ink-500">Days are counted from when you sent the quote. You can change this any time.</p>
            <div className="mt-5 grid gap-2" role="radiogroup" aria-label="Follow-up timing">
              {PRESETS.map((p) => (
                <Choice key={p.value} selected={preset === p.value} onClick={() => setPreset(p.value)} className="items-start">
                  <span className="flex flex-col">
                    <span className="flex items-center gap-2">
                      {p.label}
                      {p.recommended && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-800">Recommended</span>}
                    </span>
                    <span className="text-sm font-normal text-ink-500">{p.summary}</span>
                  </span>
                </Choice>
              ))}
            </div>
            <Button size="lg" className="mt-6 w-full" loading={pending} onClick={() => save(3, { preset })}>Continue</Button>
          </section>
        )}

        {step === 4 && (
          <section aria-labelledby="s4">
            <h1 id="s4" className="text-2xl font-bold tracking-tight text-ink-900">Connect your email</h1>
            <p className="mt-1 text-[15px] text-ink-500">QuoteFlow finds the quotes you send, follows up from your own address, and stops when customers reply.</p>
            {connected.length > 0 && (
              <ul className="mt-5 space-y-2">
                {connected.map((a) => (
                  <li key={a.email} className="flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 text-[15px] text-brand-900">
                    <CheckCircle2 className="size-5 shrink-0" aria-hidden /> <span className="truncate"><strong>{a.email}</strong> connected</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-5 grid gap-2">
              {props.google ? (
                <a href={`/api/oauth/google/start?purpose=mailbox&next=${returnTo}`} className="flex min-h-14 items-center justify-center gap-3 rounded-2xl border border-ink-200 bg-white font-semibold text-ink-800 hover:bg-ink-50">
                  <GoogleIcon /> {connected.some((a) => a.provider === "GMAIL") ? "Connect another Gmail" : "Connect Gmail"}
                </a>
              ) : null}
              {props.microsoft ? (
                <a href={`/api/oauth/microsoft/start?purpose=mailbox&next=${returnTo}`} className="flex min-h-14 items-center justify-center gap-3 rounded-2xl border border-ink-200 bg-white font-semibold text-ink-800 hover:bg-ink-50">
                  <MicrosoftIcon /> {connected.some((a) => a.provider === "OUTLOOK") ? "Connect another Outlook" : "Connect Outlook"}
                </a>
              ) : null}
              {!props.google && !props.microsoft && (
                <p className="rounded-2xl bg-sky-50 p-4 text-sm text-sky-900">
                  Email connections haven’t been set up on this QuoteFlow server yet, so you’ll add quotes manually for now. You can connect later in Settings → Email.
                </p>
              )}
            </div>
            <div className="mt-5 rounded-2xl border border-ink-200 px-4">
              <Toggle
                name="auto"
                defaultChecked={auto}
                label="Start follow-ups automatically"
                description="When we find a new quote in your sent email, start chasing it straight away. Turn off to review each one first."
              />
            </div>
            {/* Toggle is uncontrolled; read its value on continue. */}
            <Button
              size="lg"
              className="mt-6 w-full"
              loading={pending}
              onClick={(e) => {
                const input = (e.currentTarget.closest("section")?.querySelector('input[name="auto"]') as HTMLInputElement | null);
                const value = input ? input.checked : auto;
                setAuto(value);
                save(4, { autoFollowUpDetected: value });
              }}
            >
              {connected.length ? "Continue" : "Skip — I’ll add quotes manually"}
            </Button>
          </section>
        )}

        {step === 5 && (
          <section aria-labelledby="s5">
            <h1 id="s5" className="text-2xl font-bold tracking-tight text-ink-900">Choose your first follow-up message</h1>
            <p className="mt-1 text-[15px] text-ink-500">This is what customers receive first. You can edit every message later.</p>
            <div className="mt-5 grid gap-3" role="radiogroup" aria-label="Message style">
              {props.styles.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  role="radio"
                  aria-checked={style === s.key}
                  onClick={() => setStyle(s.key)}
                  className={cn(
                    "rounded-2xl border bg-white p-4 text-left transition-colors",
                    style === s.key ? "border-brand-600 ring-1 ring-brand-600" : "border-ink-200 hover:border-ink-300",
                  )}
                >
                  <span className="flex items-center justify-between">
                    <span className="font-semibold text-ink-900">{s.label}</span>
                    {style === s.key && <Check className="size-5 text-brand-700" aria-hidden />}
                  </span>
                  <span className="block text-sm text-ink-500">{s.description}</span>
                  <span className="mt-3 block whitespace-pre-wrap rounded-xl bg-ink-50 p-3 text-sm leading-relaxed text-ink-700">{s.preview}</span>
                </button>
              ))}
            </div>
            <Button size="lg" className="mt-6 w-full" loading={pending} onClick={() => save(5, { style })}>
              Finish setup
            </Button>
          </section>
        )}
      </div>
    </div>
  );
}
