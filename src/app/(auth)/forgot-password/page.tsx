import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <div className="rounded-3xl border border-ink-200/70 bg-white p-6 shadow-[var(--shadow-card)] sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">Forgot your password?</h1>
      <p className="mt-1 text-[15px] text-ink-500">Enter your email and we’ll send you a link to choose a new one.</p>
      <div className="mt-6">
        <ForgotPasswordForm />
      </div>
      <p className="mt-6 text-center text-[15px] text-ink-600">
        Remembered it? <Link href="/login" className="font-semibold text-brand-700">Log in</Link>
      </p>
    </div>
  );
}
