import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { MembershipRole } from "@prisma/client";
import { db } from "../db";
import { randomToken, sha256 } from "../crypto";
import { env } from "../env";

export const SESSION_COOKIE = "qf_session";
const SESSION_DAYS = 30;
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

export async function createSession(userId: string, organisationId?: string | null) {
  const token = randomToken(32);
  const h = await headers();
  const membership = organisationId
    ? { organisationId }
    : await db.membership.findFirst({ where: { userId }, orderBy: { createdAt: "asc" }, select: { organisationId: true } });
  await db.session.create({
    data: {
      tokenHash: sha256(token),
      userId,
      organisationId: membership?.organisationId ?? null,
      expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000),
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
      ipAddress: clientIp(h),
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export function clientIp(h: Headers): string {
  return (h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown").slice(0, 64);
}

/** Returns the current session (with user), or null. Cached per request. */
export const getSession = cache(async () => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  if (Date.now() - session.lastSeenAt.getTime() > REFRESH_AFTER_MS) {
    await db.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000) },
    });
  }
  return session;
});

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login?expired=1");
  return { session, user: session.user };
}

export type OrgContext = Awaited<ReturnType<typeof loadOrgContext>>;

const loadOrgContext = cache(async () => {
  const session = await getSession();
  if (!session) return null;
  const include = { organisation: { include: { subscription: true } } };
  // Prefer the session's active organisation; fall back to any remaining membership.
  const membership =
    (session.organisationId
      ? await db.membership.findFirst({ where: { userId: session.userId, organisationId: session.organisationId }, include })
      : null) ?? (await db.membership.findFirst({ where: { userId: session.userId }, include, orderBy: { createdAt: "asc" } }));
  if (!membership) return null;
  if (membership.organisationId !== session.organisationId) {
    await db.session.update({ where: { id: session.id }, data: { organisationId: membership.organisationId } });
  }
  return { session, user: session.user, membership, org: membership.organisation };
});

/**
 * Authenticated + authorised context for every protected page and action.
 * All data access must be scoped by `org.id` returned from here.
 */
export async function requireOrg(options: { roles?: MembershipRole[]; allowIncompleteOnboarding?: boolean } = {}) {
  const session = await getSession();
  if (!session) redirect("/login?expired=1");
  const ctx = await loadOrgContext();
  if (!ctx) {
    // No business left (e.g. removed from a team): give the user a fresh one to set up.
    const { createOrganisation } = await import("../organisations");
    const org = await db.$transaction((tx) =>
      createOrganisation(tx, { userId: session.userId, name: `${session.user.name.split(" ")[0]}'s business`.slice(0, 120), businessType: "other" }),
    );
    await db.session.update({ where: { id: session.id }, data: { organisationId: org.id } });
    redirect("/onboarding");
  }
  if (!options.allowIncompleteOnboarding && !ctx.org.onboardingDoneAt) redirect("/onboarding");
  if (options.roles && !options.roles.includes(ctx.membership.role)) redirect("/dashboard?denied=1");
  return ctx;
}

/** Variant for server actions: throws instead of redirecting on role mismatch. */
export async function requireOrgRole(roles: MembershipRole[]) {
  const ctx = await requireOrg({ allowIncompleteOnboarding: true });
  if (!roles.includes(ctx.membership.role)) {
    const { UserError } = await import("../errors");
    throw new UserError("You don't have permission to do that. Ask the account owner.");
  }
  return ctx;
}
