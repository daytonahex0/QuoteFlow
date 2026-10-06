/** Minimal RFC 5322 / MIME builder for sending through the Gmail API. */

function encodeHeader(value: string): string {
  // RFC 2047 encoded-word for non-ASCII; strip CR/LF to prevent header injection.
  const clean = value.replace(/[\r\n]+/g, " ");
  return /^[\x20-\x7e]*$/.test(clean) ? clean : `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

function formatAddress(email: string, name?: string | null) {
  const addr = email.replace(/[\r\n<>]/g, "");
  if (!name) return addr;
  const n = name.replace(/["\r\n\\]/g, "");
  return /^[\x20-\x7e]*$/.test(n) ? `"${n}" <${addr}>` : `${encodeHeader(n)} <${addr}>`;
}

function wrapBase64(content: string) {
  return Buffer.from(content, "utf8").toString("base64").replace(/.{76}/g, "$&\r\n");
}

export function buildMimeMessage(opts: {
  from: string;
  fromName?: string | null;
  to: string;
  toName?: string | null;
  subject: string;
  text: string;
  html: string;
  inReplyTo?: string | null;
  references?: string | null;
}): string {
  const boundary = `qf_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const headers = [
    `From: ${formatAddress(opts.from, opts.fromName)}`,
    `To: ${formatAddress(opts.to, opts.toName)}`,
    `Subject: ${encodeHeader(opts.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  if (opts.inReplyTo) headers.push(`In-Reply-To: ${opts.inReplyTo.replace(/[\r\n]/g, "")}`);
  if (opts.references) headers.push(`References: ${opts.references.replace(/[\r\n]/g, "")}`);
  return [
    ...headers,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(opts.text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(opts.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}
