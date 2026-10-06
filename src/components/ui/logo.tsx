import { cn } from "@/lib/cn";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#13624f" />
      <path d="M9 12.5h9.5a4.5 4.5 0 0 1 0 9H15" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      <path d="M17.5 18.5 14.5 21.5l3 3" stroke="#7dcfb3" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-[17px] font-bold tracking-tight text-ink-900", className)}>
      <LogoMark className="size-7" />
      QuoteFlow
    </span>
  );
}
