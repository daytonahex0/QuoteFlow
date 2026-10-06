"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { runAction, formBool, formString } from "@/lib/action";
import { UserError, type ActionResult } from "@/lib/errors";
import { requireOrg, requireOrgRole, destroySession } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { sendVerificationEmail } from "@/lib/auth/tokens";
import { emailSchema, passwordSchema } from "@/lib/validation";
import { isValidTimezone } from "@/lib/schedule";
import { BUSINESS_TYPE_VALUES } from "@/lib/organisations";
import { syncEmailAccount } from "@/lib/email/sync";
import { audit, logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { integrations } from "@/lib/env";
import { stripe } from "@/lib/billing/stripe";

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);

const businessSchema = z.object({
  name: z.string().trim().min(1, "Enter your business name").max(120),
  businessType: z.enum(BUSINESS_TYPE_VALUES),
  senderName: optionalText(80),
  address: optionalText(300),
  website: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? (/^https?:\/\//i.test(v) ? v : `https://${v}`) : null))
    .refine((v) => v == null || z.string().url().safeParse(v).success, "Enter a valid website address"),
  phone: z.string().trim().max(40).regex(/^[0-9+()\s-]*$/, "Enter a valid phone number").optional().transform((v) => v || null),
  signature: optionalText(1000),
});

const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_LOGO_BYTES = 512 * 1024;

export async function updateBusinessAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction("update_business", async () => {
    const { org } = await requireOrgRole(["OWNER", "ADMIN"]);
    const input = businessSchema.parse({
      name: formString(form, "name"),
      businessType: formString(form, "businessType"),
      senderName: formString(form, "senderName"),
      address: formString(form, "address"),
      website: formString(form, "website"),
      phone: formString(form, "phone"),
      signature: formString(form, "signature"),
    });
    const logo = form.get("logo");
    let logoData: { logo: Uint8Array<ArrayBuffer>; logoMimeType: string } | Record<string, never> = {};
    if (logo instanceof File && logo.size > 0) {
      if (!LOGO_TYPES.has(logo.type)) return { ok: false, error: "Logo must be a PNG, JPG or WebP image.", fieldErrors: { logo: "Use a PNG, JPG or WebP image" } };
      if (logo.size > MAX_LOGO_BYTES) return { ok: false, error: "Logo must be under 512 KB.", fieldErrors: { logo: "Keep it under 512 KB" } };
      const bytes = new Uint8Array(await logo.arrayBuffer());
      if (!looksLikeImage(bytes, logo.type)) return { ok: false, error: "That file doesn't look like a valid image.", fieldErrors: { logo: "Invalid image file" } };
      logoData = { logo: bytes, logoMimeType: logo.type };
    }
    await db.organisation.update({ where: { id: org.id }, data: { ...input, ...logoData } });
    revalidatePath("/", "layout");
    return { ok: true, message: "Business details saved." };
  });
}

/** Checks magic bytes so a renamed file can't be served as an image. */
function looksLikeImage(b: Uint8Array, type: string) {
  if (type === "image/png") return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (type === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (type === "image/webp") return String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP";
  return false;
}

export async function removeLogoAction(): Promise<ActionResult> {
  return runAction("remove_logo", async () => {
    const { org } = await requireOrgRole(["OWNER", "ADMIN"]);
    await db.organisation.update({ where: { id: org.id }, data: { logo: null, logoMimeType: null } });
    revalidatePath("/", "layout");
    return { ok: true, message: "Logo removed." };
  });
}

const followUpSettingsSchema = z
  .object({
    timezone: z.string().refine(isValidTimezone, "Choose a valid time zone"),
    sendingStartHour: z.coerce.number().int().min(0).max(23),
    sendingEndHour: z.coerce.number().int().min(1).max(24),
    sendOnWeekends: z.boolean(),
    maxDailyEmails: z.coerce.number().int().min(1, "At least 1").max(500, "At most 500"),
    autoFollowUpDetected: z.boolean(),
    defaultSequenceId: z.string().min(1),
  })
  .refine((v) => v.sendingEndHour > v.sendingStartHour, { message: "The end time must be after the start time", path: ["sendingEndHour"] });

export async function updateFollowUpSettingsAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction("update_followup_settings", async () => {
    const { org } = await requireOrgRole(["OWNER", "ADMIN"]);
    const input = followUpSettingsSchema.parse({
      timezone: formString(form, "timezone"),
      sendingStartHour: formString(form, "sendingStartHour"),
      sendingEndHour: formString(form, "sendingEndHour"),
      sendOnWeekends: formBool(form, "sendOnWeekends"),
      maxDailyEmails: formString(form, "maxDailyEmails"),
      autoFollowUpDetected: formBool(form, "autoFollowUpDetected"),
      defaultSequenceId: formString(form, "defaultSequenceId"),
    });
    const seq = await db.followUpSequence.findFirst({ where: { id: input.defaultSequenceId, organisationId: org.id } });
    if (!seq) throw new UserError("Choose a valid default sequence.");
    const { defaultSequenceId, ...settings } = input;
    await db.$transaction([
      db.organisation.update({ where: { id: org.id }, data: settings }),
      db.followUpSequence.updateMany({ where: { organisationId: org.id }, data: { isDefault: false } }),
      db.followUpSequence.update({ where: { id: defaultSequenceId }, data: { isDefault: true } }),
    ]);
    return { ok: true, message: "Follow-up settings saved." };
  });
}

export async function updateNotificationSettingsAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction("update_notifications", async () => {
    const { org } = await requireOrgRole(["OWNER", "ADMIN"]);
    await db.organisation.update({
      where: { id: org.id },
      data: {
        notifyReplies: formBool(form, "notifyReplies"),
        notifyWon: formBool(form, "notifyWon"),
        notifyFailures: formBool(form, "notifyFailures"),
        notifyByEmail: formBool(form, "notifyByEmail"),
      },
    });
    return { ok: true, message: "Notification preferences saved." };
  });
}

export async function disconnectEmailAccountAction(accountId: string): Promise<ActionResult> {
  return runAction("disconnect_email", async () => {
    const { org, user } = await requireOrgRole(["OWNER", "ADMIN"]);
    const account = await db.emailAccount.findFirst({ where: { id: accountId, organisationId: org.id } });
    if (!account) throw new UserError("Email account not found.");
    // Best-effort token revocation with Google (Microsoft has no per-token revoke endpoint).
    if (account.provider === "GMAIL" && account.refreshTokenEnc) {
      try {
        const { decrypt } = await import("@/lib/crypto");
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decrypt(account.refreshTokenEnc))}`, { method: "POST" });
      } catch (error) {
        logger.warn("email_account.revoke_failed", { organisationId: org.id, error });
      }
    }
    await db.emailAccount.delete({ where: { id: account.id } });
    audit("email_account.disconnected", { userId: user.id, organisationId: org.id, provider: account.provider });
    revalidatePath("/settings/email");
    return { ok: true, message: `${account.email} disconnected. Stored access has been deleted.` };
  });
}

export async function syncEmailAccountAction(accountId: string): Promise<ActionResult> {
  return runAction("sync_email", async () => {
    const { org, user } = await requireOrg();
    await enforceRateLimit(`sync:${user.id}`, 10, 600);
    const account = await db.emailAccount.findFirst({ where: { id: accountId, organisationId: org.id } });
    if (!account) throw new UserError("Email account not found.");
    if (account.status !== "CONNECTED") throw new UserError("Reconnect this account first.");
    const result = await syncEmailAccount(account.id);
    revalidatePath("/settings/email");
    revalidatePath("/dashboard");
    if ("expired" in result) throw new UserError("Your email connection has expired. Please reconnect.");
    if ("error" in result) throw new UserError("We couldn't check your email just now. Please try again in a minute.");
    if ("skipped" in result) return { ok: true, message: "A check is already running — results will appear shortly." };
    const parts = [
      result.detected ? `${result.detected} new quote${result.detected === 1 ? "" : "s"} found` : "No new quotes found",
      result.replies ? `${result.replies} repl${result.replies === 1 ? "y" : "ies"} detected` : null,
    ].filter(Boolean);
    return { ok: true, message: `${parts.join(", ")}.` };
  });
}

export async function updateProfileAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction("update_profile", async () => {
    const { user } = await requireOrg();
    const input = z.object({ name: z.string().trim().min(1, "Enter your name").max(100), email: emailSchema }).parse({
      name: formString(form, "name"),
      email: formString(form, "email"),
    });
    const emailChanged = input.email !== user.email;
    if (emailChanged) {
      if (!(await verifyPassword(formString(form, "currentPassword"), user.passwordHash)) && user.passwordHash) {
        return { ok: false, error: "Enter your current password to change your email.", fieldErrors: { currentPassword: "Incorrect password" } };
      }
      if (await db.user.findUnique({ where: { email: input.email } })) {
        return { ok: false, error: "That email is already in use.", fieldErrors: { email: "Already in use" } };
      }
    }
    const updated = await db.user.update({
      where: { id: user.id },
      data: { name: input.name, email: input.email, ...(emailChanged ? { emailVerifiedAt: null } : {}) },
    });
    if (emailChanged) {
      audit("user.email_changed", { userId: user.id });
      await sendVerificationEmail(updated).catch(() => undefined);
    }
    revalidatePath("/", "layout");
    return { ok: true, message: emailChanged ? "Saved. Check your new inbox to confirm the address." : "Profile saved." };
  });
}

export async function changePasswordAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction("change_password", async () => {
    const { user, session } = await requireOrg();
    await enforceRateLimit(`password:${user.id}`, 5, 900);
    if (user.passwordHash && !(await verifyPassword(formString(form, "currentPassword"), user.passwordHash))) {
      return { ok: false, error: "Your current password is incorrect.", fieldErrors: { currentPassword: "Incorrect password" } };
    }
    const password = passwordSchema.safeParse(formString(form, "newPassword"));
    if (!password.success) return { ok: false, error: "Choose a stronger password.", fieldErrors: { newPassword: password.error.issues[0]!.message } };
    await db.$transaction([
      db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password.data) } }),
      // Sign out every other device.
      db.session.deleteMany({ where: { userId: user.id, id: { not: session.id } } }),
    ]);
    audit("user.password_changed", { userId: user.id });
    return { ok: true, message: "Password updated. Other devices have been signed out." };
  });
}

export async function deleteAccountAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction("delete_account", async () => {
    const { user, membership, org } = await requireOrg({ allowIncompleteOnboarding: true });
    if (formString(form, "confirm").trim().toUpperCase() !== "DELETE") {
      return { ok: false, error: "Type DELETE to confirm.", fieldErrors: { confirm: "Type DELETE to confirm" } };
    }
    if (user.passwordHash && !(await verifyPassword(formString(form, "password"), user.passwordHash))) {
      return { ok: false, error: "Your password is incorrect.", fieldErrors: { password: "Incorrect password" } };
    }
    if (membership.role === "OWNER") {
      // Owners delete the whole business: cancel billing, then cascade-delete all data.
      const sub = await db.subscription.findUnique({ where: { organisationId: org.id } });
      if (sub?.stripeSubscriptionId && integrations.stripeConfigured() && ["ACTIVE", "TRIALING", "PAST_DUE"].includes(sub.status)) {
        await stripe().subscriptions.cancel(sub.stripeSubscriptionId);
      }
      const otherOwnedOrgs = await db.membership.findMany({ where: { userId: user.id, role: "OWNER", organisationId: { not: org.id } } });
      if (otherOwnedOrgs.length) throw new UserError("You own more than one business. Contact support to close them.");
      await db.organisation.delete({ where: { id: org.id } });
    }
    await destroySession();
    await db.user.delete({ where: { id: user.id } });
    audit("user.deleted", { userId: user.id, organisationId: org.id, ownerDeletedOrganisation: membership.role === "OWNER" });
    redirect("/?status=account_deleted");
  });
}
