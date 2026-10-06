import { env, integrations } from "../env";
import { logger } from "../logger";
import { escapeHtml, textToHtml } from "../templates";

export type OutgoingEmail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  fromName?: string;
  replyTo?: string;
  headers?: Record<string, string>;
};

export type SendResult = { delivered: boolean; mode: "resend" | "log"; id?: string };

/**
 * Transactional email (verification, password reset, notifications, and follow-ups
 * for businesses that haven't connected a mailbox) via Resend's HTTP API.
 * Without RESEND_API_KEY in development, emails are written to the server log instead.
 */
export async function sendSystemEmail(email: OutgoingEmail): Promise<SendResult> {
  if (!integrations.resendConfigured()) {
    if (env().NODE_ENV === "production") throw new Error("Email provider is not configured (RESEND_API_KEY / EMAIL_FROM)");
    logger.info("email.dev_log", { to: email.to, subject: email.subject, body: email.text });
    return { delivered: false, mode: "log" };
  }
  const from = email.fromName ? `${sanitiseName(email.fromName)} <${extractAddress(env().EMAIL_FROM!)}>` : env().EMAIL_FROM!;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env().RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email.to],
      subject: email.subject,
      text: email.text,
      html: email.html ?? textToHtml(email.text),
      reply_to: email.replyTo,
      headers: email.headers,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend error ${res.status}: ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as { id?: string };
  return { delivered: true, mode: "resend", id: json.id };
}

function extractAddress(from: string) {
  return from.match(/<([^>]+)>/)?.[1] ?? from.trim();
}

function sanitiseName(name: string) {
  return name.replace(/[<>"\r\n]/g, "").slice(0, 80);
}

/** Simple branded layout for QuoteFlow's own transactional emails. */
export function transactionalHtml(opts: { heading: string; paragraphs: string[]; cta?: { label: string; url: string }; footer?: string }) {
  const body = opts.paragraphs.map((p) => `<p style="margin:0 0 14px;color:#334155">${escapeHtml(p)}</p>`).join("");
  const cta = opts.cta
    ? `<p style="margin:24px 0"><a href="${escapeHtml(opts.cta.url)}" style="background:#0f766e;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;display:inline-block">${escapeHtml(opts.cta.label)}</a></p>`
    : "";
  return `<div style="background:#f6f7f9;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #e5e7eb">
    <p style="margin:0 0 24px;font-weight:700;font-size:18px;color:#0f172a">QuoteFlow</p>
    <h1 style="margin:0 0 16px;font-size:22px;color:#0f172a">${escapeHtml(opts.heading)}</h1>
    ${body}${cta}
    <p style="margin:24px 0 0;font-size:13px;color:#64748b">${escapeHtml(opts.footer ?? "You're receiving this because you have a QuoteFlow account.")}</p>
  </div></div>`;
}
