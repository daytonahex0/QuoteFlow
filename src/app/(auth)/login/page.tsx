import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/auth-forms";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { FlashToast } from "@/components/ui/toast";
import { getSession } from "@/lib/auth/session";
import { integrations } from "@/lib/env";
import { flashFrom } from "@/lib/flash";

export const metadata: Metadata = { title: "Log in", alternates: { canonical: "/login" } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  if (await getSession()) redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
  const flash = flashFrom(params);
  return (
    <div className="rounded-3xl border border-ink-200/70 bg-white p-6 shadow-[var(--shadow-card)] sm:p-8">
      {flash && <FlashToast kind={flash.kind} message={flash.message} />}
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">Welcome back</h1>
      <p className="mt-1 text-[15px] text-ink-500">Log in to see how your quotes are doing.</p>
      <div className="mt-6">
        <OAuthButtons google={integrations.googleConfigured()} microsoft={integrations.microsoftConfigured()} next={next} />
        <LoginForm next={next} />
      </div>
      <p className="mt-6 text-center text-[15px] text-ink-600">
        New to QuoteFlow? <Link href="/signup" className="font-semibold text-brand-700">Start free</Link>
      </p>
    </div>
  );
}
