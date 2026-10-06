import type { EmailAccount } from "@prisma/client";
import { db } from "../db";
import { decrypt, encrypt } from "../crypto";
import { OAuthTokenError, refreshAccessToken, type OAuthProvider } from "./oauth";
import { buildMimeMessage } from "./mime";

export type MailAddress = { email: string; name: string | null };

export type MailMessage = {
  id: string;
  threadId: string | null;
  internetMessageId: string | null;
  from: MailAddress | null;
  to: MailAddress[];
  subject: string;
  date: Date;
  text: string;
  attachmentNames: string[];
  quoteflowHeader: boolean;
};

export type SendOptions = {
  to: string;
  toName?: string | null;
  fromName?: string | null;
  subject: string;
  text: string;
  html: string;
  reply?: { messageId: string; threadId: string | null; internetMessageId: string | null } | null;
  followUpId?: string;
};

export class MailboxAuthError extends Error {
  constructor(message = "Mailbox authorisation expired") {
    super(message);
    this.name = "MailboxAuthError";
  }
}

export interface MailboxClient {
  listSentSince(since: Date): Promise<MailMessage[]>;
  listInboxSince(since: Date): Promise<MailMessage[]>;
  findReplyFrom(customerEmail: string, since: Date): Promise<MailMessage | null>;
  send(opts: SendOptions): Promise<{ id: string | null; threadId: string | null }>;
}

const providerKey = (a: EmailAccount): OAuthProvider => (a.provider === "GMAIL" ? "google" : "microsoft");

/** Returns a valid access token, refreshing (and persisting) it when close to expiry. */
async function accessToken(account: EmailAccount): Promise<string> {
  const fresh = account.tokenExpiresAt && account.tokenExpiresAt.getTime() - Date.now() > 120_000;
  if (fresh) return decrypt(account.accessTokenEnc);
  if (!account.refreshTokenEnc) throw new MailboxAuthError("No refresh token stored");
  try {
    const tokens = await refreshAccessToken(providerKey(account), decrypt(account.refreshTokenEnc));
    const updated = await db.emailAccount.update({
      where: { id: account.id },
      data: {
        accessTokenEnc: encrypt(tokens.access_token),
        refreshTokenEnc: tokens.refresh_token ? encrypt(tokens.refresh_token) : account.refreshTokenEnc,
        tokenExpiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000),
      },
    });
    Object.assign(account, updated);
    return tokens.access_token;
  } catch (error) {
    if (error instanceof OAuthTokenError && error.invalidGrant) throw new MailboxAuthError("Refresh token revoked or expired");
    throw error;
  }
}

async function apiFetch(account: EmailAccount, url: string, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken(account);
  const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw new MailboxAuthError(`Provider returned 401 for ${new URL(url).pathname}`);
  if (res.status === 403) {
    const body = await res.text().catch(() => "");
    // Missing scopes look like 403s; treat them as needing reconnection.
    if (/insufficient|scope|consent|permission/i.test(body)) throw new MailboxAuthError("Missing mailbox permissions");
    throw new Error(`Provider error 403: ${body.slice(0, 200)}`);
  }
  return res;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`Provider error ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  return (await res.json()) as T;
}

export function parseAddressList(header: string | undefined | null): MailAddress[] {
  if (!header) return [];
  const out: MailAddress[] = [];
  // Split on commas that are not inside quotes.
  for (const part of header.match(/(?:"[^"]*"|[^,])+/g) ?? []) {
    const m = part.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
    if (m) out.push({ name: m[1]!.trim() || null, email: m[2]!.trim().toLowerCase() });
    else if (part.includes("@")) out.push({ name: null, email: part.trim().toLowerCase() });
  }
  return out;
}

// ─────────────────────────── Gmail ───────────────────────────

type GmailPart = { mimeType?: string; filename?: string; body?: { data?: string }; parts?: GmailPart[]; headers?: { name: string; value: string }[] };
type GmailMessage = { id: string; threadId: string; internalDate: string; snippet?: string; payload: GmailPart };

function decodeB64Url(data?: string) {
  return data ? Buffer.from(data, "base64url").toString("utf8") : "";
}

export function htmlToText(html: string) {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&pound;/g, "£")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function gmailBody(part: GmailPart): { text: string; html: string; attachments: string[] } {
  let text = "";
  let html = "";
  const attachments: string[] = [];
  const walk = (p: GmailPart) => {
    if (p.filename) attachments.push(p.filename);
    else if (p.mimeType === "text/plain" && !text) text = decodeB64Url(p.body?.data);
    else if (p.mimeType === "text/html" && !html) html = decodeB64Url(p.body?.data);
    p.parts?.forEach(walk);
  };
  walk(part);
  return { text, html, attachments };
}

function toMailMessage(m: GmailMessage): MailMessage {
  const headers = new Map((m.payload.headers ?? []).map((h) => [h.name.toLowerCase(), h.value]));
  const body = gmailBody(m.payload);
  return {
    id: m.id,
    threadId: m.threadId,
    internetMessageId: headers.get("message-id") ?? null,
    from: parseAddressList(headers.get("from"))[0] ?? null,
    to: parseAddressList(headers.get("to")),
    subject: headers.get("subject") ?? "",
    date: new Date(Number(m.internalDate)),
    text: (body.text || htmlToText(body.html) || m.snippet || "").slice(0, 20_000),
    attachmentNames: body.attachments,
    quoteflowHeader: headers.has("x-quoteflow-followup"),
  };
}

class GmailClient implements MailboxClient {
  private base = "https://gmail.googleapis.com/gmail/v1/users/me";
  constructor(private account: EmailAccount) {}

  private async search(q: string, max = 50): Promise<MailMessage[]> {
    const list = await json<{ messages?: { id: string }[] }>(
      await apiFetch(this.account, `${this.base}/messages?${new URLSearchParams({ q, maxResults: String(max) })}`),
    );
    const out: MailMessage[] = [];
    for (const { id } of list.messages ?? []) {
      const msg = await json<GmailMessage>(await apiFetch(this.account, `${this.base}/messages/${id}?format=full`));
      out.push(toMailMessage(msg));
    }
    return out;
  }

  listSentSince(since: Date) {
    return this.search(`in:sent after:${Math.floor(since.getTime() / 1000)} {quote quotes quotation estimate proposal tender}`, 100);
  }

  listInboxSince(since: Date) {
    return this.search(`in:inbox -from:me after:${Math.floor(since.getTime() / 1000)}`, 100);
  }

  async findReplyFrom(customerEmail: string, since: Date) {
    const safe = customerEmail.replace(/[^a-z0-9@._+-]/gi, "");
    const found = await this.search(`from:${safe} after:${Math.floor(since.getTime() / 1000)}`, 5);
    return found.find((m) => m.from?.email === customerEmail.toLowerCase() && m.date >= since) ?? null;
  }

  async send(opts: SendOptions) {
    const raw = buildMimeMessage({
      from: this.account.email,
      fromName: opts.fromName,
      to: opts.to,
      toName: opts.toName,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      inReplyTo: opts.reply?.internetMessageId,
      references: opts.reply?.internetMessageId,
    }).replace("MIME-Version: 1.0", `MIME-Version: 1.0\r\nX-QuoteFlow-FollowUp: ${opts.followUpId ?? "test"}`);
    const body: Record<string, string> = { raw: Buffer.from(raw).toString("base64url") };
    if (opts.reply?.threadId) body.threadId = opts.reply.threadId;
    const sent = await json<{ id: string; threadId: string }>(
      await apiFetch(this.account, `${this.base}/messages/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    return { id: sent.id, threadId: sent.threadId };
  }
}

// ─────────────────────────── Microsoft Graph ───────────────────────────

type GraphRecipient = { emailAddress: { address: string; name?: string } };
type GraphMessage = {
  id: string;
  conversationId?: string;
  internetMessageId?: string;
  subject?: string;
  from?: GraphRecipient;
  toRecipients?: GraphRecipient[];
  sentDateTime?: string;
  receivedDateTime?: string;
  body?: { contentType: string; content: string };
  bodyPreview?: string;
  hasAttachments?: boolean;
  attachments?: { name: string }[];
};

const graphAddr = (r?: GraphRecipient): MailAddress | null =>
  r?.emailAddress?.address ? { email: r.emailAddress.address.toLowerCase(), name: r.emailAddress.name ?? null } : null;

function graphToMail(m: GraphMessage): MailMessage {
  const content = m.body?.content ?? "";
  return {
    id: m.id,
    threadId: m.conversationId ?? null,
    internetMessageId: m.internetMessageId ?? null,
    from: graphAddr(m.from),
    to: (m.toRecipients ?? []).map(graphAddr).filter((a): a is MailAddress => Boolean(a)),
    subject: m.subject ?? "",
    date: new Date(m.sentDateTime ?? m.receivedDateTime ?? Date.now()),
    text: (m.body?.contentType === "html" ? htmlToText(content) : content || m.bodyPreview || "").slice(0, 20_000),
    attachmentNames: (m.attachments ?? []).map((a) => a.name),
    quoteflowHeader: false,
  };
}

class OutlookClient implements MailboxClient {
  private base = "https://graph.microsoft.com/v1.0/me";
  constructor(private account: EmailAccount) {}

  private async list(url: string): Promise<MailMessage[]> {
    const res = await apiFetch(this.account, url, { headers: { Prefer: 'outlook.body-content-type="text"' } });
    const data = await json<{ value: GraphMessage[] }>(res);
    return data.value.map(graphToMail);
  }

  listSentSince(since: Date) {
    const params = new URLSearchParams({
      $filter: `sentDateTime ge ${since.toISOString()}`,
      $select: "id,conversationId,internetMessageId,subject,from,toRecipients,sentDateTime,body,hasAttachments",
      $expand: "attachments($select=name)",
      $orderby: "sentDateTime desc",
      $top: "50",
    });
    return this.list(`${this.base}/mailFolders/sentitems/messages?${params}`);
  }

  listInboxSince(since: Date) {
    const params = new URLSearchParams({
      $filter: `receivedDateTime ge ${since.toISOString()}`,
      $select: "id,conversationId,internetMessageId,subject,from,toRecipients,receivedDateTime,body",
      $orderby: "receivedDateTime desc",
      $top: "100",
    });
    return this.list(`${this.base}/mailFolders/inbox/messages?${params}`);
  }

  async findReplyFrom(customerEmail: string, since: Date) {
    const addr = customerEmail.toLowerCase().replace(/'/g, "''");
    const params = new URLSearchParams({
      $filter: `receivedDateTime ge ${since.toISOString()} and from/emailAddress/address eq '${addr}'`,
      $select: "id,conversationId,internetMessageId,subject,from,toRecipients,receivedDateTime,body",
      $top: "5",
    });
    const found = await this.list(`${this.base}/messages?${params}`);
    return found[0] ?? null;
  }

  async send(opts: SendOptions) {
    const headers = { "Content-Type": "application/json" };
    if (opts.reply?.messageId) {
      // Reply inside the original conversation so the customer sees one thread.
      const draft = await json<GraphMessage>(
        await apiFetch(this.account, `${this.base}/messages/${encodeURIComponent(opts.reply.messageId)}/createReply`, { method: "POST", headers }),
      );
      await json<GraphMessage>(
        await apiFetch(this.account, `${this.base}/messages/${encodeURIComponent(draft.id)}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ body: { contentType: "HTML", content: opts.html } }),
        }),
      );
      const res = await apiFetch(this.account, `${this.base}/messages/${encodeURIComponent(draft.id)}/send`, { method: "POST", headers });
      if (!res.ok) throw new Error(`Graph send failed: ${res.status}`);
      return { id: null, threadId: draft.conversationId ?? opts.reply.threadId };
    }
    const res = await apiFetch(this.account, `${this.base}/sendMail`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message: {
          subject: opts.subject,
          body: { contentType: "HTML", content: opts.html },
          toRecipients: [{ emailAddress: { address: opts.to, name: opts.toName ?? undefined } }],
          internetMessageHeaders: [{ name: "X-QuoteFlow-FollowUp", value: opts.followUpId ?? "test" }],
        },
        saveToSentItems: true,
      }),
    });
    if (!res.ok) throw new Error(`Graph sendMail failed: ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
    return { id: null, threadId: null };
  }
}

export function mailboxClient(account: EmailAccount): MailboxClient {
  return account.provider === "GMAIL" ? new GmailClient(account) : new OutlookClient(account);
}
