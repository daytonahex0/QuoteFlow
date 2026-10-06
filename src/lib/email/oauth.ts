import { createHash } from "node:crypto";
import { env, appUrl } from "../env";
import { randomToken } from "../crypto";

export type OAuthProvider = "google" | "microsoft";
export type OAuthPurpose = "signin" | "mailbox";

const SIGNIN_SCOPES: Record<OAuthProvider, string[]> = {
  google: ["openid", "email", "profile"],
  microsoft: ["openid", "email", "profile", "User.Read"],
};

const MAILBOX_SCOPES: Record<OAuthProvider, string[]> = {
  google: [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
  ],
  microsoft: ["openid", "email", "profile", "offline_access", "User.Read", "Mail.Read", "Mail.Send"],
};

export function isProvider(value: string): value is OAuthProvider {
  return value === "google" || value === "microsoft";
}

export function providerConfigured(provider: OAuthProvider) {
  const e = env();
  return provider === "google"
    ? Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET)
    : Boolean(e.MICROSOFT_CLIENT_ID && e.MICROSOFT_CLIENT_SECRET);
}

function endpoints(provider: OAuthProvider) {
  if (provider === "google") {
    return { auth: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token" };
  }
  const tenant = encodeURIComponent(env().MICROSOFT_TENANT);
  return {
    auth: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    token: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
  };
}

function credentials(provider: OAuthProvider) {
  const e = env();
  return provider === "google"
    ? { clientId: e.GOOGLE_CLIENT_ID!, clientSecret: e.GOOGLE_CLIENT_SECRET! }
    : { clientId: e.MICROSOFT_CLIENT_ID!, clientSecret: e.MICROSOFT_CLIENT_SECRET! };
}

export function redirectUri(provider: OAuthProvider) {
  return appUrl(`/api/oauth/${provider}/callback`);
}

/** Builds the provider authorisation URL with state + PKCE. */
export function buildAuthUrl(provider: OAuthProvider, purpose: OAuthPurpose, loginHint?: string) {
  const state = randomToken(24);
  const codeVerifier = randomToken(48);
  const challenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const scopes = purpose === "mailbox" ? MAILBOX_SCOPES[provider] : SIGNIN_SCOPES[provider];
  const params = new URLSearchParams({
    client_id: credentials(provider).clientId,
    redirect_uri: redirectUri(provider),
    response_type: "code",
    scope: scopes.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  if (provider === "google") {
    params.set("include_granted_scopes", "true");
    if (purpose === "mailbox") {
      params.set("access_type", "offline");
      params.set("prompt", "consent");
    } else params.set("prompt", "select_account");
  } else {
    params.set("response_mode", "query");
    params.set("prompt", "select_account");
  }
  if (loginHint) params.set("login_hint", loginHint);
  return { url: `${endpoints(provider).auth}?${params}`, state, codeVerifier };
}

export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
};

export class OAuthTokenError extends Error {
  constructor(message: string, public invalidGrant: boolean) {
    super(message);
  }
}

async function tokenRequest(provider: OAuthProvider, body: Record<string, string>): Promise<TokenResponse> {
  const { clientId, clientSecret } = credentials(provider);
  const res = await fetch(endpoints(provider).token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...body }),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    throw new OAuthTokenError(`Token request failed: ${json.error ?? res.status}`, json.error === "invalid_grant");
  }
  return json;
}

export function exchangeCode(provider: OAuthProvider, code: string, codeVerifier: string) {
  return tokenRequest(provider, {
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri(provider),
  });
}

export function refreshAccessToken(provider: OAuthProvider, refreshToken: string) {
  return tokenRequest(provider, { grant_type: "refresh_token", refresh_token: refreshToken });
}

export type OAuthProfile = { id: string; email: string; name: string; emailVerified: boolean };

export async function fetchProfile(provider: OAuthProvider, accessToken: string): Promise<OAuthProfile> {
  if (provider === "google") {
    const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`Google profile request failed: ${res.status}`);
    const p = (await res.json()) as { sub: string; email: string; name?: string; email_verified?: boolean };
    return { id: p.sub, email: p.email.toLowerCase(), name: p.name ?? p.email, emailVerified: Boolean(p.email_verified) };
  }
  const res = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Microsoft profile request failed: ${res.status}`);
  const p = (await res.json()) as { id: string; displayName?: string; mail?: string | null; userPrincipalName: string };
  const email = (p.mail || p.userPrincipalName).toLowerCase();
  // The Microsoft `mail` attribute can be set by any tenant admin, so it is never
  // trusted for linking to an existing account (prevents "nOAuth" account takeover).
  return { id: p.id, email, name: p.displayName ?? email, emailVerified: false };
}
