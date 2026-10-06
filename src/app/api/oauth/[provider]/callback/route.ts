import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode, fetchProfile, isProvider, type OAuthProvider, type OAuthPurpose } from "@/lib/email/oauth";
import { encrypt, safeEqual, verifyPayload } from "@/lib/crypto";
import { createSession, getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { audit, logger } from "@/lib/logger";
import { createOrganisation } from "@/lib/organisations";
import { syncEmailAccount } from "@/lib/email/sync";

type OAuthCookie = {
  state: string;
  codeVerifier: string;
  provider: OAuthProvider;
  purpose: OAuthPurpose;
  userId?: string;
  organisationId?: string;
  next: string;
  exp: number;
};

const REQUIRED_SCOPES: Record<OAuthProvider, string[]> = {
  google: ["gmail.readonly", "gmail.send"],
  microsoft: ["mail.read", "mail.send"],
};

function redirectTo(req: NextRequest, path: string, params: Record<string, string> = {}) {
  const url = new URL(path, req.nextUrl.origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url);
  res.cookies.delete({ name: "qf_oauth", path: "/api/oauth" });
  return res;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const jar = await cookies();
  const saved = verifyPayload<OAuthCookie>(jar.get("qf_oauth")?.value);
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const code = req.nextUrl.searchParams.get("code");
  const fallback = saved?.purpose === "mailbox" ? saved.next : "/login";

  if (!isProvider(provider) || !saved || saved.provider !== provider || saved.exp < Date.now() || !safeEqual(saved.state, state)) {
    return redirectTo(req, fallback, { error: "oauth_state" });
  }
  if (req.nextUrl.searchParams.get("error") || !code) {
    return redirectTo(req, fallback, { error: "oauth_cancelled" });
  }

  try {
    const tokens = await exchangeCode(provider, code, saved.codeVerifier);
    const profile = await fetchProfile(provider, tokens.access_token);

    if (saved.purpose === "mailbox") {
      const session = await getSession();
      if (!session || session.userId !== saved.userId || !saved.organisationId) return redirectTo(req, "/login", { error: "session_expired" });
      const granted = (tokens.scope ?? "").toLowerCase();
      if (!REQUIRED_SCOPES[provider].every((s) => granted.includes(s))) {
        return redirectTo(req, saved.next, { error: "oauth_scopes" });
      }
      if (!tokens.refresh_token) {
        const existing = await db.emailAccount.findFirst({ where: { organisationId: saved.organisationId, email: profile.email } });
        if (!existing?.refreshTokenEnc) return redirectTo(req, saved.next, { error: "oauth_offline" });
      }
      const dbProvider = provider === "google" ? "GMAIL" : "OUTLOOK";
      const data = {
        accessTokenEnc: encrypt(tokens.access_token),
        ...(tokens.refresh_token ? { refreshTokenEnc: encrypt(tokens.refresh_token) } : {}),
        tokenExpiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000),
        scope: tokens.scope ?? null,
        status: "CONNECTED" as const,
        lastError: null,
        displayName: profile.name,
        connectedById: session.userId,
      };
      const account = await db.emailAccount.upsert({
        where: { organisationId_provider_email: { organisationId: saved.organisationId, provider: dbProvider, email: profile.email } },
        create: { organisationId: saved.organisationId, provider: dbProvider, email: profile.email, ...data, refreshTokenEnc: tokens.refresh_token ? encrypt(tokens.refresh_token) : null },
        update: data,
      });
      // Release follow-ups that were waiting for this mailbox to be reconnected.
      await db.scheduledFollowUp.updateMany({
        where: { organisationId: saved.organisationId, status: "SCHEDULED", quote: { emailAccountId: account.id }, lastError: { startsWith: "Waiting for your email" } },
        data: { scheduledFor: new Date(), lastError: null },
      });
      audit("email_account.connected", { userId: session.userId, organisationId: saved.organisationId, provider: dbProvider });
      // First sync straight away so detected quotes appear immediately (bounded so the redirect stays fast).
      await Promise.race([syncEmailAccount(account.id).catch(() => undefined), new Promise((r) => setTimeout(r, 8000))]);
      return redirectTo(req, saved.next, { status: "email_connected" });
    }

    // Sign-in / sign-up with Google or Microsoft.
    const identity = await db.oAuthIdentity.findUnique({ where: { provider_providerAccountId: { provider, providerAccountId: profile.id } } });
    let userId = identity?.userId;
    let isNew = false;
    if (!userId) {
      const existing = await db.user.findUnique({ where: { email: profile.email } });
      if (existing) {
        if (!profile.emailVerified) return redirectTo(req, "/login", { error: "oauth_link" });
        await db.oAuthIdentity.create({ data: { userId: existing.id, provider, providerAccountId: profile.id } });
        if (!existing.emailVerifiedAt) await db.user.update({ where: { id: existing.id }, data: { emailVerifiedAt: new Date() } });
        userId = existing.id;
      } else {
        isNew = true;
        userId = await db.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              email: profile.email,
              name: profile.name.slice(0, 100),
              emailVerifiedAt: profile.emailVerified ? new Date() : null,
              identities: { create: { provider, providerAccountId: profile.id } },
            },
          });
          await createOrganisation(tx, { userId: user.id, name: `${profile.name.split(" ")[0]}'s business`.slice(0, 120), businessType: "other" });
          return user.id;
        });
      }
    }
    await createSession(userId);
    audit(isNew ? "user.signup" : "user.login", { userId, method: provider });
    return redirectTo(req, isNew ? "/onboarding" : saved.next);
  } catch (error) {
    logger.error("oauth.callback_failed", { provider, purpose: saved.purpose, error });
    return redirectTo(req, fallback, { error: "oauth_failed" });
  }
}
