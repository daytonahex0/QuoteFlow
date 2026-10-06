import { NextResponse, type NextRequest } from "next/server";
import { buildAuthUrl, isProvider, providerConfigured, type OAuthPurpose } from "@/lib/email/oauth";
import { signPayload } from "@/lib/crypto";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

const OAUTH_COOKIE = "qf_oauth";

function back(req: NextRequest, path: string, error: string) {
  const url = new URL(path, req.nextUrl.origin);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const purpose: OAuthPurpose = req.nextUrl.searchParams.get("purpose") === "mailbox" ? "mailbox" : "signin";
  const nextParam = req.nextUrl.searchParams.get("next") ?? "";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : purpose === "mailbox" ? "/settings/email" : "/dashboard";

  if (!isProvider(provider)) return back(req, "/login", "oauth_unknown");
  if (!providerConfigured(provider)) return back(req, purpose === "mailbox" ? next : "/login", "oauth_not_configured");

  let userId: string | undefined;
  let organisationId: string | undefined;
  if (purpose === "mailbox") {
    const session = await getSession();
    if (!session) return back(req, "/login", "session_expired");
    const membership = await db.membership.findFirst({
      where: { userId: session.userId, ...(session.organisationId ? { organisationId: session.organisationId } : {}) },
    });
    if (!membership || membership.role === "MEMBER") return back(req, next, "oauth_forbidden");
    userId = session.userId;
    organisationId = membership.organisationId;
  }

  const { url, state, codeVerifier } = buildAuthUrl(provider, purpose);
  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_COOKIE, signPayload({ state, codeVerifier, provider, purpose, userId, organisationId, next, exp: Date.now() + 10 * 60_000 }), {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/oauth",
    maxAge: 600,
  });
  return res;
}
