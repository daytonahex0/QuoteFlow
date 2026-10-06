"use client";

import { useActionState } from "react";
import { createQuoteAction } from "@/app/actions/quotes";
import { Button } from "@/components/ui/button";
import { Input, Select, Toggle } from "@/components/ui/field";
import type { ActionResult } from "@/lib/errors";

export function NewQuoteForm({ sequences, today, canStart }: { sequences: { id: string; name: string; summary: string; isDefault: boolean }[]; today: string; canStart: boolean }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(createQuoteAction, null);
  const err = (k: string) => (state && !state.ok ? state.fieldErrors?.[k] : undefined);
  const defaultSeq = sequences.find((s) => s.isDefault) ?? sequences[0];

  return (
    <form action={action} className="space-y-6" noValidate>
      {state && !state.ok && !state.fieldErrors && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{state.error}</div>
      )}
      <fieldset className="space-y-4">
        <legend className="mb-1 text-sm font-bold uppercase tracking-wider text-ink-500">Customer</legend>
        <Input label="Customer name" name="customerName" autoComplete="off" required maxLength={120} error={err("customerName")} placeholder="e.g. James Smith" />
        <Input label="Customer email" name="customerEmail" type="email" inputMode="email" autoComplete="off" required error={err("customerEmail")} placeholder="james@example.com" />
        <Input label="Phone" name="customerPhone" type="tel" inputMode="tel" autoComplete="off" optional maxLength={40} error={err("customerPhone")} />
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="mb-1 text-sm font-bold uppercase tracking-wider text-ink-500">Quote</legend>
        <Input label="Quote amount" name="amount" inputMode="decimal" prefix="£" placeholder="2,400" error={err("amount")} hint="Leave blank if you’d rather not say." />
        <Input label="Quote description" name="description" required maxLength={200} error={err("description")} placeholder="e.g. Bathroom renovation" />
        <Input label="Quote date" name="sentAt" type="date" required defaultValue={today} max={today} error={err("sentAt")} hint="The day you sent the quote. Follow-ups are timed from this date." />
      </fieldset>
      <fieldset className="space-y-3 rounded-2xl bg-ink-50 p-4">
        <legend className="sr-only">Follow-ups</legend>
        <Toggle
          name="startFollowUps"
          defaultChecked={canStart}
          disabled={!canStart}
          label="Start follow-ups now"
          description={canStart ? "QuoteFlow will chase this quote automatically until the customer replies." : "Your subscription isn't active, so follow-ups can't start yet."}
        />
        {sequences.length > 1 ? (
          <Select label="Follow-up sequence" name="sequenceId" defaultValue={defaultSeq?.id}>
            {sequences.map((s) => (
              <option key={s.id} value={s.id}>{s.name} — {s.summary}</option>
            ))}
          </Select>
        ) : (
          defaultSeq && (
            <>
              <input type="hidden" name="sequenceId" value={defaultSeq.id} />
              <p className="text-sm text-ink-600">Sequence: <strong>{defaultSeq.name}</strong> ({defaultSeq.summary})</p>
            </>
          )
        )}
      </fieldset>
      <div className="pb-safe sticky bottom-16 -mx-4 border-t border-ink-200 bg-ink-50/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <Button type="submit" size="lg" className="w-full sm:w-auto" loading={pending}>Save quote</Button>
      </div>
    </form>
  );
}
