"use client";

import { forwardRef, useId, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const control =
  "block w-full rounded-xl border border-ink-200 bg-white px-3.5 text-[16px] text-ink-900 placeholder:text-ink-400 shadow-xs transition-colors focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100 disabled:bg-ink-50 disabled:text-ink-500 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-100";

type FieldShellProps = { label: ReactNode; hint?: ReactNode; error?: string; id: string; children: ReactNode; className?: string; optional?: boolean };

export function FieldShell({ label, hint, error, id, children, className, optional }: FieldShellProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="flex items-baseline justify-between text-sm font-medium text-ink-800">
        <span>{label}</span>
        {optional && <span className="text-xs font-normal text-ink-400">Optional</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-ink-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode; error?: string; optional?: boolean; prefix?: string };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, hint, error, optional, className, id, prefix, ...props }, ref) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldShell label={label} hint={hint} error={error} id={fieldId} className={className} optional={optional}>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-ink-500">{prefix}</span>}
        <input
          ref={ref}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
          className={cn(control, "min-h-12", prefix && "pl-8")}
          {...props}
        />
      </div>
    </FieldShell>
  );
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: ReactNode; hint?: ReactNode; error?: string; optional?: boolean };

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ label, hint, error, optional, className, id, ...props }, ref) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldShell label={label} hint={hint} error={error} id={fieldId} className={className} optional={optional}>
      <textarea
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={cn(control, "py-3 leading-relaxed")}
        {...props}
      />
    </FieldShell>
  );
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label: ReactNode; hint?: ReactNode; error?: string; optional?: boolean };

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ label, hint, error, optional, className, id, children, ...props }, ref) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldShell label={label} hint={hint} error={error} id={fieldId} className={className} optional={optional}>
      <select
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        className={cn(control, "min-h-12 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22%2367737f%22><path d=%22M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z%22/></svg>')] bg-[length:20px] bg-[right_12px_center] bg-no-repeat pr-10")}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  );
});

export function Toggle({ name, label, description, defaultChecked, disabled }: { name: string; label: ReactNode; description?: ReactNode; defaultChecked?: boolean; disabled?: boolean }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-h-12 cursor-pointer items-start justify-between gap-4 py-2">
      <span className="min-w-0">
        <span className="block text-[15px] font-medium text-ink-900">{label}</span>
        {description && <span className="mt-0.5 block text-sm text-ink-500">{description}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input id={id} name={name} type="checkbox" defaultChecked={defaultChecked} disabled={disabled} className="peer sr-only" />
        <span className="h-7 w-12 rounded-full bg-ink-200 transition-colors peer-checked:bg-brand-600 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-100 peer-disabled:opacity-50" />
        <span className="absolute left-0.5 top-0.5 size-6 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}
