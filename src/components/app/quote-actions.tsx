"use client";

import { useFormAction } from "@/components/ui/use-form-action";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { QuoteStatus } from "@prisma/client";
import { Pause, Play, Trophy, XCircle, Send, MessageSquareReply, RotateCcw, Trash2, Check, Pencil } from "lucide-react";
import { deleteQuoteAction, quoteCommandAction, updateQuoteAction, type QuoteCommand } from "@/app/actions/quotes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/errors";

type Preview = { to: string; subject: string; body: string; from: string } | null;

function useCommand(quoteId: string) {
  const [pending, start] = useTransition();
  const [active, setActive] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();
  const run = (cmd: QuoteCommand, after?: () => void) => {
    setActive(cmd.command);
    start(async () => {
      const r = await quoteCommandAction(quoteId, cmd);
      setActive(null);
      if (r.ok) {
        toast.success(r.message ?? "Done.");
        after?.();
        router.refresh();
      } else toast.error(r.error, { label: "Retry", onClick: () => run(cmd, after) });
    });
  };
  return { run, pending, active };
}

function ConfirmDialog({
  dialogRef,
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  children,
}: {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  title: string;
  body?: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  children?: React.ReactNode;
}) {
  return (
    <dialog
      ref={dialogRef}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl border border-ink-200 p-0 shadow-2xl backdrop:bg-ink-900/40"
      onClick={(e) => e.target === dialogRef.current && dialogRef.current?.close()}
    >
      <div className="p-6">
        <h2 className="text-lg font-bold text-ink-900">{title}</h2>
        {body && <p className="mt-2 text-[15px] text-ink-600">{body}</p>}
        {children}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => dialogRef.current?.close()}>Cancel</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={() => { dialogRef.current?.close(); onConfirm(); }}>{confirmLabel}</Button>
        </div>
      </div>
    </dialog>
  );
}

export function QuoteActions({ quoteId, status, needsAttention, preview, hasNext }: { quoteId: string; status: QuoteStatus; needsAttention: boolean; preview: Preview; hasNext: boolean }) {
  const { run, pending, active } = useCommand(quoteId);
  const sendDialog = useRef<HTMLDialogElement>(null);
  const lostDialog = useRef<HTMLDialogElement>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const [deleting, startDelete] = useTransition();
  const toast = useToast();
  const open = status === "NEW" || status === "FOLLOWING_UP" || status === "PAUSED";
  const btn = (cmd: QuoteCommand["command"]) => ({ loading: pending && active === cmd, disabled: pending });

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {status === "NEW" && (
          <Button className="col-span-2" onClick={() => run({ command: "start" })} {...btn("start")}>
            <Play className="size-4" aria-hidden /> Start follow-ups
          </Button>
        )}
        {status === "FOLLOWING_UP" && hasNext && (
          <Button variant="secondary" className="col-span-2" onClick={() => sendDialog.current?.showModal()} {...btn("send_now")}>
            <Send className="size-4" aria-hidden /> Send follow-up now
          </Button>
        )}
        {(status === "REPLIED" || open) && (
          <Button onClick={() => run({ command: "won" })} {...btn("won")}>
            <Trophy className="size-4" aria-hidden /> Mark won
          </Button>
        )}
        {(status === "REPLIED" || open) && (
          <Button variant="outline" onClick={() => lostDialog.current?.showModal()} {...btn("lost")}>
            <XCircle className="size-4" aria-hidden /> Mark lost
          </Button>
        )}
        {status === "FOLLOWING_UP" && (
          <Button variant="outline" onClick={() => run({ command: "pause" })} {...btn("pause")}>
            <Pause className="size-4" aria-hidden /> Pause follow-up
          </Button>
        )}
        {status === "PAUSED" && (
          <Button variant="outline" onClick={() => run({ command: "resume" })} {...btn("resume")}>
            <Play className="size-4" aria-hidden /> Resume follow-up
          </Button>
        )}
        {open && (
          <Button variant="outline" onClick={() => run({ command: "replied" })} {...btn("replied")}>
            <MessageSquareReply className="size-4" aria-hidden /> Customer replied
          </Button>
        )}
        {status === "REPLIED" && needsAttention && (
          <Button variant="outline" className="col-span-2" onClick={() => run({ command: "acknowledge" })} {...btn("acknowledge")}>
            <Check className="size-4" aria-hidden /> Mark as handled
          </Button>
        )}
        {(status === "WON" || status === "LOST") && (
          <Button variant="outline" className="col-span-2" onClick={() => run({ command: "reopen" })} {...btn("reopen")}>
            <RotateCcw className="size-4" aria-hidden /> Reopen quote
          </Button>
        )}
      </div>
      <button
        type="button"
        onClick={() => deleteDialog.current?.showModal()}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-rose-700 hover:bg-rose-50"
      >
        <Trash2 className="size-4" aria-hidden /> {deleting ? "Deleting…" : "Delete quote"}
      </button>

      <ConfirmDialog
        dialogRef={sendDialog}
        title="Send this follow-up now?"
        confirmLabel="Send now"
        onConfirm={() => run({ command: "send_now" })}
      >
        {preview ? (
          <div className="mt-4 overflow-hidden rounded-2xl border border-ink-200 text-sm">
            <dl className="space-y-1 border-b border-ink-100 bg-ink-50 px-4 py-3">
              <div className="flex gap-2"><dt className="w-14 shrink-0 text-ink-500">From</dt><dd className="truncate text-ink-800">{preview.from}</dd></div>
              <div className="flex gap-2"><dt className="w-14 shrink-0 text-ink-500">To</dt><dd className="truncate text-ink-800">{preview.to}</dd></div>
              <div className="flex gap-2"><dt className="w-14 shrink-0 text-ink-500">Subject</dt><dd className="font-semibold text-ink-900">{preview.subject}</dd></div>
            </dl>
            <p className="max-h-64 overflow-y-auto whitespace-pre-wrap px-4 py-3 leading-relaxed text-ink-800">{preview.body}</p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-600">The next follow-up in the sequence will be sent straight away.</p>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        dialogRef={lostDialog}
        title="Mark this quote as lost?"
        body="Any remaining follow-ups will be cancelled. You can reopen the quote later."
        confirmLabel="Mark lost"
        onConfirm={() => run({ command: "lost" })}
      />
      <ConfirmDialog
        dialogRef={deleteDialog}
        danger
        title="Delete this quote?"
        body="The quote, its follow-ups and conversation history will be permanently deleted. This can't be undone."
        confirmLabel="Delete quote"
        onConfirm={() =>
          startDelete(async () => {
            const r = await deleteQuoteAction(quoteId);
            if (r && !r.ok) toast.error(r.error);
          })
        }
      />
    </div>
  );
}

export function SequencePicker({ quoteId, current, sequences, disabled }: { quoteId: string; current: string | null; sequences: { id: string; name: string; summary: string }[]; disabled?: boolean }) {
  const { run, pending } = useCommand(quoteId);
  return (
    <label className="block">
      <span className="sr-only">Follow-up sequence</span>
      <select
        defaultValue={current ?? ""}
        disabled={disabled || pending}
        onChange={(e) => e.target.value && run({ command: "change_sequence", sequenceId: e.target.value })}
        className="min-h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-[15px] disabled:opacity-60"
      >
        {!current && <option value="">Default sequence</option>}
        {sequences.map((s) => (
          <option key={s.id} value={s.id}>{s.name} ({s.summary})</option>
        ))}
      </select>
    </label>
  );
}

export function EditQuoteDetails({ quoteId, defaults }: { quoteId: string; defaults: { customerName: string; customerPhone: string; amount: string; description: string } }) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const [state, action, pending] = useFormAction(async (prev: ActionResult | null, form: FormData): Promise<ActionResult> => {
    const r = await updateQuoteAction(quoteId, prev, form);
    if (r.ok) {
      toast.success(r.message ?? "Saved.");
      setOpen(false);
      router.refresh();
    } else if (!r.fieldErrors) toast.error(r.error);
    return r;
  });
  const err = (k: string) => (state && !state.ok ? state.fieldErrors?.[k] : undefined);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800">
        <Pencil className="size-4" aria-hidden /> Edit details
      </button>
    );
  }
  return (
    <form onSubmit={action} className="mt-4 space-y-4 border-t border-ink-100 pt-4" noValidate>
      <Input label="Customer name" name="customerName" defaultValue={defaults.customerName} required error={err("customerName")} />
      <Input label="Phone" name="customerPhone" type="tel" defaultValue={defaults.customerPhone} optional error={err("customerPhone")} />
      <Input label="Quote amount" name="amount" inputMode="decimal" prefix="£" defaultValue={defaults.amount} error={err("amount")} />
      <Input label="Quote description" name="description" defaultValue={defaults.description} required error={err("description")} />
      <div className="flex gap-2">
        <Button type="submit" loading={pending}>Save</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}
