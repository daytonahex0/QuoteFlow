import { cn } from "@/lib/cn";

export function Stat({ value, label, hint, emphasis, className }: { value: string; label: string; hint?: string; emphasis?: boolean; className?: string }) {
  return (
    <div className={cn("rounded-[var(--radius-card)] border p-4 sm:p-5", emphasis ? "border-brand-700 bg-brand-700 text-white" : "border-ink-200/70 bg-white shadow-[var(--shadow-card)]", className)}>
      <p className={cn("text-[1.7rem] font-bold leading-tight tracking-tight tabular sm:text-3xl", emphasis ? "text-white" : "text-ink-900")}>{value}</p>
      <p className={cn("mt-0.5 text-sm font-medium", emphasis ? "text-brand-100" : "text-ink-500")}>{label}</p>
      {hint && <p className={cn("mt-1 text-xs", emphasis ? "text-brand-200" : "text-ink-400")}>{hint}</p>}
    </div>
  );
}
