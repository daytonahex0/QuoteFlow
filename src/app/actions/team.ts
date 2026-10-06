"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { runAction, formString } from "@/lib/action";
import { UserError, type ActionResult } from "@/lib/errors";
import { getSession, requireOrgRole } from "@/lib/auth/session";
import { getEntitlement } from "@/lib/billing/entitlements";
import { emailSchema } from "@/lib/validation";
import { randomToken, sha256 } from "@/lib/crypto";
import { appUrl } from "@/lib/env";
import { sendSystemEmail, transactionalHtml } from "@/lib/email/system-mailer";
import { enforceRateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/logger";

export async function inviteMemberAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction("invite_member", async () => {
    const { org, user } = await requireOrgRole(["OWNER", "ADMIN"]);
    const input = z.object({ email: emailSchema, role: z.enum(["ADMIN", "MEMBER"]) }).parse({ email: formString(form, "email"), role: formString(form, "role") || "MEMBER" });
    await enforceRateLimit(`invite:${org.id}`, 20, 3600);
    const ent = await getEntitlement(org.id);
    const [members, pending] = await Promise.all([
      db.membership.count({ where: { organisationId: org.id } }),
      db.invitation.count({ where: { organisationId: org.id, acceptedAt: null, expiresAt: { gt: new Date() } } }),
    ]);
    if (members + pending >= ent.limits.seats) {
      throw new UserError(ent.limits.seats <= 1 ? "Multiple users are available on the Pro plan." : `Your plan allows up to ${ent.limits.seats} users.`);
    }
    const existingMember = await db.membership.findFirst({ where: { organisationId: org.id, user: { email: input.email } } });
    if (existingMember) throw new UserError("That person is already on your team.");

    const token = randomToken(32);
    await db.invitation.deleteMany({ where: { organisationId: org.id, email: input.email, acceptedAt: null } });
    await db.invitation.create({
      data: { organisationId: org.id, email: input.email, role: input.role, tokenHash: sha256(token), invitedById: user.id, expiresAt: new Date(Date.now() + 7 * 86400_000) },
    });
    const url = appUrl(`/invite/${token}`);
    const result = await sendSystemEmail({
      to: input.email,
      subject: `${user.name} invited you to ${org.name} on QuoteFlow`,
      text: `${user.name} has invited you to join ${org.name} on QuoteFlow.\n\nAccept the invitation: ${url}\n\nThis link expires in 7 days.`,
      html: transactionalHtml({
        heading: `Join ${org.name} on QuoteFlow`,
        paragraphs: [`${user.name} has invited you to help follow up on quotes for ${org.name}.`, "This invitation expires in 7 days."],
        cta: { label: "Accept invitation", url },
      }),
    });
    audit("team.invited", { userId: user.id, organisationId: org.id, role: input.role });
    revalidatePath("/settings/team");
    return { ok: true, message: result.delivered ? `Invitation sent to ${input.email}.` : "Invitation created. Email isn't configured, so the link was written to the server log." };
  });
}

export async function revokeInvitationAction(id: string): Promise<ActionResult> {
  return runAction("revoke_invite", async () => {
    const { org } = await requireOrgRole(["OWNER", "ADMIN"]);
    await db.invitation.deleteMany({ where: { id, organisationId: org.id } });
    revalidatePath("/settings/team");
    return { ok: true, message: "Invitation cancelled." };
  });
}

export async function removeMemberAction(membershipId: string): Promise<ActionResult> {
  return runAction("remove_member", async () => {
    const { org, user } = await requireOrgRole(["OWNER", "ADMIN"]);
    const target = await db.membership.findFirst({ where: { id: membershipId, organisationId: org.id } });
    if (!target) throw new UserError("Team member not found.");
    if (target.role === "OWNER") throw new UserError("The account owner can't be removed.");
    if (target.userId === user.id) throw new UserError("You can't remove yourself.");
    await db.$transaction([
      db.membership.delete({ where: { id: target.id } }),
      db.session.deleteMany({ where: { userId: target.userId, organisationId: org.id } }),
    ]);
    audit("team.removed", { userId: user.id, organisationId: org.id, removedUserId: target.userId });
    revalidatePath("/settings/team");
    return { ok: true, message: "Team member removed." };
  });
}

export async function acceptInvitationAction(token: string) {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  const invitation = await db.invitation.findUnique({ where: { tokenHash: sha256(token) } });
  if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date() || invitation.email !== session.user.email) {
    redirect(`/invite/${encodeURIComponent(token)}`);
  }
  await db.$transaction([
    db.membership.upsert({
      where: { userId_organisationId: { userId: session.userId, organisationId: invitation.organisationId } },
      create: { userId: session.userId, organisationId: invitation.organisationId, role: invitation.role },
      update: {},
    }),
    db.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } }),
    db.session.update({ where: { id: session.id }, data: { organisationId: invitation.organisationId } }),
  ]);
  audit("team.joined", { userId: session.userId, organisationId: invitation.organisationId });
  redirect("/dashboard");
}
