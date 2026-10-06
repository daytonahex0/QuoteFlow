import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { getSession } from "@/lib/auth/session";
import { acceptInvitationAction } from "@/app/actions/team";

export const metadata: Metadata = { title: "Team invitation", robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await db.invitation.findUnique({ where: { tokenHash: sha256(token) }, include: { organisation: { select: { name: true } } } });
  const valid = invitation && !invitation.acceptedAt && invitation.expiresAt > new Date();
  const session = await getSession();

  if (!valid) {
    return (
      <div className="rounded-3xl border border-ink-200/70 bg-white p-8 text-center shadow-[var(--shadow-card)]">
        <h1 className="text-2xl font-bold text-ink-900">Invitation not valid</h1>
        <p className="mt-2 text-ink-600">This invitation has expired or already been used. Ask the account owner to send a new one.</p>
        <ButtonLink href="/" variant="outline" className="mt-6 w-full">Go to homepage</ButtonLink>
      </div>
    );
  }
  if (!session) {
    const user = await db.user.findUnique({ where: { email: invitation.email }, select: { id: true } });
    if (!user) redirect(`/signup?invite=${encodeURIComponent(token)}`);
  }

  return (
    <div className="rounded-3xl border border-ink-200/70 bg-white p-8 text-center shadow-[var(--shadow-card)]">
      <Users className="mx-auto size-12 text-brand-600" aria-hidden />
      <h1 className="mt-4 text-2xl font-bold text-ink-900">Join {invitation.organisation.name}</h1>
      <p className="mt-2 text-ink-600">You’ve been invited to help follow up on quotes for {invitation.organisation.name}.</p>
      {session ? (
        session.user.email === invitation.email ? (
          <form action={acceptInvitationAction.bind(null, token)} className="mt-6">
            <button type="submit" className="min-h-12 w-full rounded-xl bg-brand-700 font-semibold text-white hover:bg-brand-800">Accept invitation</button>
          </form>
        ) : (
          <p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
            This invitation was sent to {invitation.email}, but you’re logged in as {session.user.email}. Log out and sign in with the invited email.
          </p>
        )
      ) : (
        <ButtonLink href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`} className="mt-6 w-full">Log in to accept</ButtonLink>
      )}
    </div>
  );
}
