import type { QuoteStatus } from "@prisma/client";
import { cn } from "@/lib/cn";

export const STATUS_META: Record<QuoteStatus, { label: string; className: string; dot: string }> = {
  NEW: { label: "New", className: "bg-ink-100 text-ink-700", dot: "bg-ink-400" },
  FOLLOWING_UP: { label: "Following up", className: "bg-sky-50 text-sky-800", dot: "bg-sky-500" },
  REPLIED: { label: "Customer replied", className: "bg-amber-50 text-amber-800", dot: "bg-amber-500" },
  WON: { label: "Won", className: "bg-brand-50 text-brand-800", dot: "bg-brand-600" },
  LOST: { label: "Lost", className: "bg-rose-50 text-rose-700", dot: "bg-rose-400" },
  PAUSED: { label: "Paused", className: "bg-ink-100 text-ink-600", dot: "bg-ink-400" },
};

export function StatusBadge({ status, className }: { status: QuoteStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", meta.className, className)}>
      <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden />
      {meta.label}
    </span>
  );
}

export function Badge({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: "neutral" | "brand" | "warning" | "danger" | "info"; className?: string }) {
  const tones = {
    neutral: "bg-ink-100 text-ink-700",
    brand: "bg-brand-50 text-brand-800",
    warning: "bg-amber-50 text-amber-800",
    danger: "bg-rose-50 text-rose-700",
    info: "bg-sky-50 text-sky-800",
  };
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", tones[tone], className)}>{children}</span>;
}
