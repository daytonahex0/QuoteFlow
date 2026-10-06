import type { Metadata } from "next";
import { CheckCircle2, XCircle } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { verifyEmailToken } from "@/lib/auth/tokens";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const ok = token ? await verifyEmailToken(token) : false;
  const session = await getSession();
  return (
    <div className="rounded-3xl border border-ink-200/70 bg-white p-8 text-center shadow-[var(--shadow-card)]">
      {ok ? <CheckCircle2 className="mx-auto size-12 text-brand-600" aria-hidden /> : <XCircle className="mx-auto size-12 text-rose-500" aria-hidden />}
      <h1 className="mt-4 text-2xl font-bold text-ink-900">{ok ? "Email confirmed" : "This link has expired"}</h1>
      <p className="mt-2 text-[15px] text-ink-600">
        {ok
          ? "Thanks — your email address is confirmed."
          : "Verification links last 48 hours and can only be used once. You can request a new one from your dashboard."}
      </p>
      <ButtonLink href={session ? "/dashboard" : "/login"} className="mt-6 w-full">
        {session ? "Go to dashboard" : "Log in"}
      </ButtonLink>
    </div>
  );
}
