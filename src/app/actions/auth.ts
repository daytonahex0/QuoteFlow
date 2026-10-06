"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { runAction, formString } from "@/lib/action";
import { UserError, type ActionResult } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { clientIp, createSession, destroySession, getSession } from "@/lib/auth/session";
import { consumeToken, sendPasswordResetEmail, sendVerificationEmail } from "@/lib/auth/tokens";
import { createOrganisation } from "@/lib/organisations";
import { emailSchema, loginSchema, passwordSchema, signupSchema } from "@/lib/validation";
import { audit, logger } from "@/lib/logger";
import { sha256 } from "@/lib/crypto";
import { safeNext } from "@/lib/safe-redirect";


async function ip() {
  return clientIp(await headers());
}

export async function signupAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction("signup", async () => {
    await enforceRateLimit(`signup:${await ip()}`, 10, 3600);
    const inviteToken = formString(form, "invite");
    const invitation = inviteToken
      ? await db.invitation.findUnique({ where: { tokenHash: sha256(inviteToken) }, include: { organisation: true } })
      : null;
    const validInvite = invitation && !invitation.acceptedAt && invitation.expiresAt > new Date() ? invitation : null;

    const input = validInvite
      ? signupSchema.partial({ businessName: true, businessType: true }).parse({
          name: formString(form, "name"),
          email: formString(form, "email"),
          password: formString(form, "password"),
        })
      : signupSchema.parse({
          name: formString(form, "name"),
          businessName: formString(form, "businessName"),
          email: formString(form, "email"),
          password: formString(form, "password"),
          businessType: formString(form, "businessType"),
        });

    if (validInvite && validInvite.email !== input.email) {
      throw new UserError("Use the email address your invitation was sent to.");
    }
    const existing = await db.user.findUnique({ where: { email: input.email } });
    if (existing) {
      return { ok: false, error: "An account with this email already exists.", fieldErrors: { email: "Already registered — log in instead." } };
    }

    const passwordHash = await hashPassword(input.password);
    const { user, organisationId } = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          // Accepting an emailed invitation proves ownership of the address.
          emailVerifiedAt: validInvite ? new Date() : null,
        },
      });
      if (validInvite) {
        await tx.membership.create({ data: { userId: user.id, organisationId: validInvite.organisationId, role: validInvite.role } });
        await tx.invitation.update({ where: { id: validInvite.id }, data: { acceptedAt: new Date() } });
        return { user, organisationId: validInvite.organisationId };
      }
      const org = await createOrganisation(tx, { userId: user.id, name: input.businessName!, businessType: input.businessType! });
      return { user, organisationId: org.id };
    });
    audit("user.signup", { userId: user.id, organisationId, viaInvite: Boolean(validInvite) });

    await createSession(user.id, organisationId);
    if (!validInvite) {
      try {
        await sendVerificationEmail(user);
      } catch (error) {
        logger.error("auth.verification_email_failed", { userId: user.id, error });
      }
    }
    redirect(validInvite ? "/dashboard" : "/onboarding");
  });
}

export async function loginAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction("login", async () => {
    const input = loginSchema.parse({ email: formString(form, "email"), password: formString(form, "password") });
    const address = await ip();
    await enforceRateLimit(`login:ip:${address}`, 30, 900);
    await enforceRateLimit(`login:email:${input.email}`, 8, 900);
    const user = await db.user.findUnique({ where: { email: input.email } });
    const valid = await verifyPassword(input.password, user?.passwordHash);
    if (!user || !valid) {
      audit("user.login_failed", { email: input.email, ip: address });
      if (user && !user.passwordHash) return { ok: false, error: "This account uses Google or Microsoft sign-in. Use the button above, or reset your password." };
      return { ok: false, error: "That email and password don't match. Please try again." };
    }
    await createSession(user.id);
    audit("user.login", { userId: user.id, ip: address });
    redirect(safeNext(formString(form, "next")));
  });
}

export async function logoutAction() {
  const session = await getSession();
  await destroySession();
  if (session) audit("user.logout", { userId: session.userId });
  redirect("/login?status=signed_out");
}

export async function forgotPasswordAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction("forgot_password", async () => {
    const email = emailSchema.parse(formString(form, "email"));
    await enforceRateLimit(`forgot:ip:${await ip()}`, 10, 3600);
    await enforceRateLimit(`forgot:email:${email}`, 3, 3600);
    const user = await db.user.findUnique({ where: { email } });
    if (user) {
      await sendPasswordResetEmail(user);
      audit("user.password_reset_requested", { userId: user.id });
    }
    // Same response either way so emails can't be enumerated.
    return { ok: true, message: "If an account exists for that email, we've sent a reset link. Check your inbox." };
  });
}

export async function resetPasswordAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction("reset_password", async () => {
    await enforceRateLimit(`reset:${await ip()}`, 10, 900);
    const password = z.object({ password: passwordSchema }).parse({ password: formString(form, "password") }).password;
    if (password !== formString(form, "confirm")) return { ok: false, error: "Passwords don't match.", fieldErrors: { confirm: "Passwords don't match" } };
    const userId = await consumeToken(formString(form, "token"), "PASSWORD_RESET");
    if (!userId) throw new UserError("This reset link has expired or already been used. Request a new one.");
    await db.$transaction([
      db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(password), emailVerifiedAt: new Date() } }),
      db.session.deleteMany({ where: { userId } }), // sign out everywhere
    ]);
    audit("user.password_reset", { userId });
    await createSession(userId);
    redirect("/dashboard?status=password_reset");
  });
}

export async function resendVerificationAction(): Promise<ActionResult> {
  return runAction("resend_verification", async () => {
    const session = await getSession();
    if (!session) redirect("/login");
    if (session.user.emailVerifiedAt) return { ok: true, message: "Your email is already confirmed." };
    await enforceRateLimit(`verify:${session.userId}`, 3, 3600);
    const result = await sendVerificationEmail(session.user);
    return {
      ok: true,
      message: result.delivered ? `We've sent a new link to ${session.user.email}.` : "Email sending isn't configured on this server — the link was written to the server log.",
    };
  });
}
