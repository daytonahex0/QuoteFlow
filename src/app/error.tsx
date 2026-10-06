"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return (
    <main className="grid min-h-[60dvh] place-items-center px-4">
      <div className="max-w-sm text-center">
        <h1 className="text-2xl font-bold text-ink-900">{offline ? "You’re offline" : "Something went wrong"}</h1>
        <p className="mt-2 text-ink-600">
          {offline ? "Check your connection and try again." : "Sorry about that. Please try again — if it keeps happening, contact support."}
        </p>
        {error.digest && <p className="mt-2 text-xs text-ink-400">Reference: {error.digest}</p>}
        <button onClick={reset} className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-xl bg-brand-700 px-5 font-semibold text-white hover:bg-brand-800">
          <RefreshCw className="size-4" aria-hidden /> Try again
        </button>
      </div>
    </main>
  );
}
