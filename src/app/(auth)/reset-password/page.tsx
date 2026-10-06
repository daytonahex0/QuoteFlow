import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="rounded-3xl border border-ink-200/70 bg-white p-6 shadow-[var(--shadow-card)] sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">Choose a new password</h1>
      {token ? (
        <div className="mt-6">
          <ResetPasswordForm token={token} />
        </div>
      ) : (
        <p className="mt-3 text-[15px] text-ink-600">
          This link is missing its security code. <Link href="/forgot-password" className="font-semibold text-brand-700">Request a new reset link</Link>.
        </p>
      )}
    </div>
  );
}
