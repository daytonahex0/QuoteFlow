"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";

type ToastKind = "success" | "error" | "info";
type Toast = { id: number; kind: ToastKind; message: string; action?: { label: string; onClick: () => void } };

const ToastContext = createContext<{ push: (kind: ToastKind, message: string, action?: Toast["action"]) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (kind: ToastKind, message: string, action?: Toast["action"]) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t.slice(-2), { id, kind, message, action }]);
      setTimeout(() => dismiss(id), kind === "error" ? 8000 : 4500);
    },
    [dismiss],
  );
  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:pr-6">
        {toasts.map((t) => {
          const Icon = t.kind === "success" ? CheckCircle2 : t.kind === "error" ? AlertCircle : Info;
          return (
            <div
              key={t.id}
              role={t.kind === "error" ? "alert" : "status"}
              className={cn(
                "animate-toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border bg-white px-4 py-3 shadow-[var(--shadow-raised)]",
                t.kind === "error" ? "border-rose-200" : "border-ink-200",
              )}
            >
              <Icon className={cn("mt-0.5 size-5 shrink-0", t.kind === "success" ? "text-brand-600" : t.kind === "error" ? "text-rose-600" : "text-ink-500")} aria-hidden />
              <p className="flex-1 text-sm text-ink-800">{t.message}</p>
              {t.action && (
                <button className="text-sm font-semibold text-brand-700" onClick={() => { t.action!.onClick(); dismiss(t.id); }}>
                  {t.action.label}
                </button>
              )}
              <button onClick={() => dismiss(t.id)} className="-m-1 rounded-lg p-1 text-ink-400 hover:text-ink-700" aria-label="Dismiss">
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return {
    success: (m: string) => ctx.push("success", m),
    error: (m: string, action?: Toast["action"]) => ctx.push("error", m, action),
    info: (m: string) => ctx.push("info", m),
  };
}

/** Shows a toast once from a server-rendered flash value (e.g. ?status=connected). */
export function FlashToast({ kind, message }: { kind: ToastKind; message: string }) {
  const ctx = useContext(ToastContext);
  useEffect(() => {
    ctx?.push(kind, message);
    const url = new URL(window.location.href);
    ["status", "error", "checkout", "verified", "denied"].forEach((k) => url.searchParams.delete(k));
    window.history.replaceState(null, "", url.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
