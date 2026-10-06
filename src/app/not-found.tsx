import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-ink-50 px-4">
      <div className="max-w-sm text-center">
        <Logo className="justify-center" />
        <h1 className="mt-8 text-2xl font-bold text-ink-900">We can’t find that page</h1>
        <p className="mt-2 text-ink-600">It may have been moved or deleted, or the link might be wrong.</p>
        <Link href="/dashboard" className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-brand-700 px-5 font-semibold text-white hover:bg-brand-800">
          Go to dashboard
        </Link>
      </div>
    </main>
  );
}
