import type { TokenPurpose } from "@prisma/client";
import { db } from "../db";
import { randomToken, sha256 } from "../crypto";
import { appUrl } from "../env";
import { sendSystemEmail, transactionalHtml } from "../email/system-mailer";

const TTL: Record<TokenPurpose, number> = {
  EMAIL_VERIFICATION: 48 * 3600_000,
  PASSWORD_RESET: 60 * 60_000,
};

export async function issueToken(userId: string, purpose: TokenPurpose) {
  // Only the newest token of each purpose is valid.
  await db.verificationToken.deleteMany({ where: { userId, purpose, usedAt: null } });
  const token = randomToken(32);
  await db.verificationToken.create({
    data: { userId, purpose, tokenHash: sha256(token), expiresAt: new Date(Date.now() + TTL[purpose]) },
  });
  return token;
}

/** Atomically consumes a token. Returns the user id, or null if invalid/expired/used. */
export async function consumeToken(token: string, purpose: TokenPurpose): Promise<string | null> {
  if (!token || token.length > 200) return null;
  const record = await db.verificationToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.purpose !== purpose || record.usedAt || record.expiresAt < new Date()) return null;
  const res = await db.verificationToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
  return res.count === 1 ? record.userId : null;
}

export async function sendVerificationEmail(user: { id: string; email: string; name: string }) {
  const token = await issueToken(user.id, "EMAIL_VERIFICATION");
  const url = appUrl(`/verify-email?token=${encodeURIComponent(token)}`);
  return sendSystemEmail({
    to: user.email,
    subject: "Confirm your email for QuoteFlow",
    text: `Hi ${user.name},\n\nConfirm your email address to finish setting up QuoteFlow:\n${url}\n\nThis link expires in 48 hours.`,
    html: transactionalHtml({
      heading: "Confirm your email",
      paragraphs: [`Hi ${user.name},`, "Confirm your email address to finish setting up QuoteFlow. This link expires in 48 hours."],
      cta: { label: "Confirm email", url },
      footer: "If you didn't create a QuoteFlow account, you can ignore this email.",
    }),
  });
}

export async function sendPasswordResetEmail(user: { id: string; email: string; name: string }) {
  const token = await issueToken(user.id, "PASSWORD_RESET");
  const url = appUrl(`/reset-password?token=${encodeURIComponent(token)}`);
  return sendSystemEmail({
    to: user.email,
    subject: "Reset your QuoteFlow password",
    text: `Hi ${user.name},\n\nReset your password using this link (valid for 1 hour):\n${url}\n\nIf you didn't ask for this, you can ignore this email.`,
    html: transactionalHtml({
      heading: "Reset your password",
      paragraphs: [`Hi ${user.name},`, "Use the button below to choose a new password. The link is valid for 1 hour."],
      cta: { label: "Reset password", url },
      footer: "If you didn't ask to reset your password, you can safely ignore this email.",
    }),
  });
}

export async function verifyEmailToken(token: string): Promise<boolean> {
  const userId = await consumeToken(token, "EMAIL_VERIFICATION");
  if (!userId) return false;
  await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  return true;
}
