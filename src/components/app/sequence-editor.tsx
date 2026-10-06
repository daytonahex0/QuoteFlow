"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Send, Save, Star, ArrowUp, ArrowDown } from "lucide-react";
import type { SequencePreset } from "@prisma/client";
import { createSequenceAction, deleteSequenceAction, saveSequenceAction, sendTestEmailAction, setDefaultSequenceAction } from "@/app/actions/sequences";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { TEMPLATE_VARIABLES, findUnknownVariables, renderTemplate } from "@/lib/templates";
import { cn } from "@/lib/cn";

type Step = { key: string; delayDays: number; subject: string; body: string };

type Props = {
  sequence: { id: string; name: string; isDefault: boolean; steps: { delayDays: number; subject: string; body: string }[] };
  maxSteps: number;
  businessName: string;
  senderName: string;
  signature: string | null;
  userEmail: string;
  sample: { customerName: string; amountPence: number | null; description: string };
};

let counter = 0;
const newKey = () => `s${++counter}`;

export function SequenceEditor({ sequence, maxSteps, businessName, senderName, signature, userEmail, sample }: Props) {
  const [name, setName] = useState(sequence.name);
  const [steps, setSteps] = useState<Step[]>(sequence.steps.map((s) => ({ ...s, key: newKey() })));
  const [selected, setSelected] = useState(0);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();
  const [busy, startBusy] = useTransition();
  const focused = useRef<{ el: HTMLInputElement | HTMLTextAreaElement; index: number; field: "subject" | "body" } | null>(null);
  const toast = useToast();
  const router = useRouter();

  const step = steps[Math.min(selected, steps.length - 1)];
  const ctx = { customerName: sample.customerName, businessName, amountPence: sample.amountPence, description: sample.description, senderName, signature };
  const unknown = step ? [...new Set([...findUnknownVariables(step.subject), ...findUnknownVariables(step.body)])] : [];

  const update = (i: number, patch: Partial<Step>) => setSteps((all) => all.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const insertVariable = (key: string) => {
    const token = `{{${key}}}`;
    const f = focused.current;
    if (!f) {
      if (step) update(selected, { body: `${step.body}${token}` });
      return;
    }
    const { el, index, field } = f;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const value = el.value.slice(0, start) + token + el.value.slice(end);
    update(index, { [field]: value } as Partial<Step>);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const addStep = () => {
    const last = steps.at(-1);
    setSteps((all) => [
      ...all,
      {
        key: newKey(),
        delayDays: (last?.delayDays ?? 0) + 5,
        subject: "Checking in about your quote",
        body: "Hi {{customer_first_name}},\n\nJust checking in about the quote for {{quote_description}}. Happy to help with any questions.\n\nThanks,\n{{signature}}",
      },
    ]);
    setSelected(steps.length);
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    setSteps((all) => {
      const copy = [...all];
      // Swap content but keep each position's delay so timing stays in order.
      const a = copy[i]!;
      const b = copy[j]!;
      copy[i] = { ...b, delayDays: a.delayDays };
      copy[j] = { ...a, delayDays: b.delayDays };
      return copy;
    });
    setSelected(j);
  };

  const save = () =>
    startSave(async () => {
      const r = await saveSequenceAction(sequence.id, { name, steps: steps.map(({ delayDays, subject, body }) => ({ delayDays: Number(delayDays), subject, body })) });
      if (r.ok) {
        setErrors({});
        toast.success(r.message ?? "Saved.");
        router.refresh();
      } else {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.fieldErrors?.steps ?? r.error);
      }
    });

  const sendTest = () =>
    step &&
    startTest(async () => {
      const r = await sendTestEmailAction({ subject: step.subject, body: step.body });
      if (r.ok) toast.success(r.message ?? `Test sent to ${userEmail}.`);
      else toast.error(r.error);
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-5">
        <Input label="Sequence name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} error={errors.name} />

        <div>
          <p className="mb-2 text-sm font-medium text-ink-800">Follow-ups</p>
          <ol className="space-y-3">
            {steps.map((s, i) => (
              <li key={s.key}>
                <div
                  className={cn(
                    "rounded-[var(--radius-card)] border bg-white p-4 shadow-[var(--shadow-card)] transition-colors sm:p-5",
                    i === selected ? "border-brand-500 ring-1 ring-brand-500" : "border-ink-200/70",
                  )}
                  onFocusCapture={() => setSelected(i)}
                  onClick={() => setSelected(i)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-ink-900">Follow-up {i + 1}</p>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="grid size-10 place-items-center rounded-lg text-ink-500 hover:bg-ink-100 disabled:opacity-30" aria-label={`Move follow-up ${i + 1} earlier`}>
                        <ArrowUp className="size-4" />
                      </button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === steps.length - 1} className="grid size-10 place-items-center rounded-lg text-ink-500 hover:bg-ink-100 disabled:opacity-30" aria-label={`Move follow-up ${i + 1} later`}>
                        <ArrowDown className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSteps((all) => all.filter((_, idx) => idx !== i));
                          setSelected(Math.max(0, i - 1));
                        }}
                        disabled={steps.length === 1}
                        className="grid size-10 place-items-center rounded-lg text-rose-600 hover:bg-rose-50 disabled:opacity-30"
                        aria-label={`Remove follow-up ${i + 1}`}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-4">
                    <Input
                      label="Days after quote is sent"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={90}
                      value={String(s.delayDays)}
                      onChange={(e) => update(i, { delayDays: Number(e.target.value) })}
                      error={errors[`steps.${i}.delayDays`]}
                      className="max-w-[220px]"
                    />
                    <Input
                      label="Subject"
                      value={s.subject}
                      maxLength={200}
                      onChange={(e) => update(i, { subject: e.target.value })}
                      onFocus={(e) => (focused.current = { el: e.currentTarget, index: i, field: "subject" })}
                      error={errors[`steps.${i}.subject`]}
                    />
                    <Textarea
                      label="Message"
                      rows={8}
                      value={s.body}
                      maxLength={5000}
                      onChange={(e) => update(i, { body: e.target.value })}
                      onFocus={(e) => (focused.current = { el: e.currentTarget, index: i, field: "body" })}
                      error={errors[`steps.${i}.body`]}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {steps.length < maxSteps ? (
            <Button variant="outline" className="mt-3 w-full" onClick={addStep}>
              <Plus className="size-4" aria-hidden /> Add follow-up
            </Button>
          ) : (
            <p className="mt-3 text-sm text-ink-500">Your plan allows up to {maxSteps} follow-ups per sequence.</p>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-ink-800">Insert a variable</p>
          <div className="flex flex-wrap gap-2">
            {TEMPLATE_VARIABLES.map((v) => (
              <button
                key={v.key}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertVariable(v.key)}
                className="min-h-10 rounded-full border border-ink-200 bg-white px-3 font-mono text-[13px] text-ink-700 hover:border-brand-400 hover:bg-brand-50"
                title={v.label}
              >
                {`{{${v.key}}}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <p className="mb-2 text-sm font-medium text-ink-800">Preview — follow-up {selected + 1}</p>
        {step && (
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-ink-200 bg-white shadow-[var(--shadow-card)]">
            <dl className="space-y-1 border-b border-ink-100 bg-ink-50 px-4 py-3 text-sm">
              <div className="flex gap-2"><dt className="w-14 shrink-0 text-ink-500">To</dt><dd className="truncate text-ink-800">{sample.customerName}</dd></div>
              <div className="flex gap-2"><dt className="w-14 shrink-0 text-ink-500">Subject</dt><dd className="font-semibold text-ink-900">{renderTemplate(step.subject, ctx)}</dd></div>
              <div className="flex gap-2"><dt className="w-14 shrink-0 text-ink-500">When</dt><dd className="text-ink-800">{step.delayDays} day{step.delayDays === 1 ? "" : "s"} after the quote</dd></div>
            </dl>
            <p className="whitespace-pre-wrap px-4 py-4 text-[15px] leading-relaxed text-ink-800">{renderTemplate(step.body, ctx)}</p>
          </div>
        )}
        {unknown.length > 0 && (
          <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            Unknown variable{unknown.length > 1 ? "s" : ""}: {unknown.map((u) => `{{${u}}}`).join(", ")}. Check the spelling.
          </p>
        )}
        <p className="mt-2 text-xs text-ink-500">Preview uses {sample.customerName === "James Smith" ? "example" : "your latest quote's"} details. Replies to follow-ups stop the sequence automatically.</p>
        <div className="pb-safe sticky bottom-16 z-10 -mx-4 mt-4 grid grid-cols-2 gap-2 border-t border-ink-200 bg-ink-50/95 px-4 py-3 backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0">
          <Button onClick={save} loading={saving}>
            <Save className="size-4" aria-hidden /> Save template
          </Button>
          <Button variant="outline" onClick={sendTest} loading={testing}>
            <Send className="size-4" aria-hidden /> Send test
          </Button>
        </div>
        <div className="mt-6 space-y-2 border-t border-ink-200 pt-4">
          {!sequence.isDefault && (
            <>
              <Button
                variant="ghost"
                className="w-full justify-start"
                loading={busy}
                onClick={() =>
                  startBusy(async () => {
                    const r = await setDefaultSequenceAction(sequence.id);
                    if (r.ok) {
                      toast.success(r.message ?? "Updated.");
                      router.refresh();
                    } else toast.error(r.error);
                  })
                }
              >
                <Star className="size-4" aria-hidden /> Make this the default
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start text-rose-700 hover:bg-rose-50"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm("Delete this sequence? Active quotes will switch to your default sequence.")) return;
                  startBusy(async () => {
                    const r = await deleteSequenceAction(sequence.id);
                    if (r && !r.ok) toast.error(r.error);
                  });
                }}
              >
                <Trash2 className="size-4" aria-hidden /> Delete sequence
              </Button>
            </>
          )}
          {sequence.isDefault && <p className="text-sm text-ink-500">This is your default sequence — new quotes use it automatically.</p>}
        </div>
      </aside>
    </div>
  );
}

export function NewSequenceButtons({ allowed, starter }: { allowed: boolean; starter: boolean }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  if (!allowed) {
    return (
      <p className="rounded-2xl bg-ink-100 p-4 text-sm text-ink-600">
        {starter ? "Custom sequences are available on Growth and Pro." : "You've reached your plan's sequence limit."}{" "}
        <a href="/settings/billing" className="font-semibold text-brand-700 underline">See plans</a>
      </p>
    );
  }
  const create = (preset: SequencePreset) =>
    start(async () => {
      const r = await createSequenceAction(preset);
      if (r && !r.ok) toast.error(r.error);
    });
  return (
    <div className="rounded-2xl border border-dashed border-ink-300 p-4">
      <p className="text-sm font-medium text-ink-800">New sequence from a preset</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(["STANDARD", "GENTLE", "PERSISTENT", "CUSTOM"] as SequencePreset[]).map((p) => (
          <Button key={p} variant="outline" size="sm" disabled={pending} onClick={() => create(p)}>
            {p.charAt(0) + p.slice(1).toLowerCase()}
          </Button>
        ))}
      </div>
    </div>
  );
}
