import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/auth/auth-forms";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { FlashToast } from "@/components/ui/toast";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { integrations } from "@/lib/env";
import { flashFrom } from "@/lib/flash";
import { BUSINESS_TYPES } from "@/lib/organisations";
import { TRIAL_DAYS } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Start your free trial",
  description: `Create your QuoteFlow account. ${TRIAL_DAYS}-day free trial, no card needed.`,
  alternates: { canonical: "/signup" },
};

export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const session = await getSession();
  const inviteToken = typeof params.invite === "string" ? params.invite : undefined;
  if (session && !inviteToken) redirect("/dashboard");
  const invitation = inviteToken
    ? await db.invitation.findUnique({ where: { tokenHash: sha256(inviteToken) }, include: { organisation: { select: { name: true } } } })
    : null;
  const validInvite = invitation && !invitation.acceptedAt && invitation.expiresAt > new Date() ? invitation : null;
  const flash = flashFrom(params);

  return (
    <div className="rounded-3xl border border-ink-200/70 bg-white p-6 shadow-[var(--shadow-card)] sm:p-8">
      {flash && <FlashToast kind={flash.kind} message={flash.message} />}
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">{validInvite ? `Join ${validInvite.organisation.name}` : "Start your free trial"}</h1>
      <p className="mt-1 text-[15px] text-ink-500">
        {validInvite ? "Create your login to join the team on QuoteFlow." : `${TRIAL_DAYS} days free. No card needed. Set up in about 5 minutes.`}
      </p>
      <div className="mt-6">
        {!validInvite && <OAuthButtons google={integrations.googleConfigured()} microsoft={integrations.microsoftConfigured()} />}
        <SignupForm
          businessTypes={BUSINESS_TYPES.map((b) => ({ value: b.value, label: b.label }))}
          invite={validInvite ? inviteToken : undefined}
          inviteEmail={validInvite?.email}
          inviteOrg={validInvite?.organisation.name}
        />
      </div>
      <p className="mt-6 text-center text-[15px] text-ink-600">
        Already have an account? <Link href="/login" className="font-semibold text-brand-700">Log in</Link>
      </p>
    </div>
  );
}
