import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export function EmptyState({ icon: Icon, title, description, children, className }: { icon: LucideIcon; title: string; description: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-700">
        <Icon className="size-7" aria-hidden />
      </div>
      <h3 className="text-lg font-semibold text-ink-900">{title}</h3>
      <p className="mt-1.5 max-w-sm text-[15px] text-ink-500">{description}</p>
      {children && <div className="mt-6 flex w-full max-w-xs flex-col gap-2 sm:max-w-none sm:flex-row sm:justify-center">{children}</div>}
    </div>
  );
}
