import type { MailAddress, MailMessage } from "./mailbox";

const QUOTE_WORDS = /\b(quote|quotes|quotation|quotations|estimate|estimates|proposal|tender)\b/i;
const NOT_A_QUOTE = /\b(unsubscribe|newsletter|invoice|receipt|payment received|order confirmation)\b/i;
const NO_REPLY = /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|notifications?)@/i;
const PERSONAL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "hotmail.co.uk", "live.com", "live.co.uk",
  "yahoo.com", "yahoo.co.uk", "icloud.com", "me.com", "aol.com", "btinternet.com", "sky.com", "virginmedia.com", "msn.com",
]);

/** Finds a GBP amount in free text, preferring amounts near words like "total". Returns pence. */
export function extractAmountPence(text: string): number | null {
  const pattern = /(?:£|GBP\s?)\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(\s?[kK]\b)?/g;
  const candidates: { pence: number; weight: number }[] = [];
  for (const m of text.matchAll(pattern)) {
    const pounds = parseInt(m[1]!.replace(/,/g, ""), 10);
    const pennies = m[2] ? parseInt(m[2].padEnd(2, "0"), 10) : 0;
    let pence = pounds * 100 + pennies;
    if (m[3]) pence *= 1000;
    if (!Number.isFinite(pence) || pence <= 0 || pence > 10_000_000_00) continue;
    const context = text.slice(Math.max(0, (m.index ?? 0) - 40), (m.index ?? 0)).toLowerCase();
    let weight = 0;
    if (/total|grand|inc(l|\.)?\s*vat|including vat|price|cost|quote|quoted|amount|sum/.test(context)) weight += 2;
    if (/deposit|per hour|p\/h|hourly|call.?out|discount|saving/.test(context)) weight -= 2;
    candidates.push({ pence, weight });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.weight - a.weight || b.pence - a.pence);
  return candidates[0]!.pence;
}

/** Turns "RE: Quote for bathroom renovation - ABC Plumbing" into "Bathroom renovation". */
export function describeFromSubject(subject: string, businessName?: string): string {
  let s = subject.replace(/^\s*((re|fwd?|fw)\s*:\s*)+/i, "").trim();
  if (businessName) s = s.replace(new RegExp(`\\s*[-–|:]\\s*${escapeRegExp(businessName)}\\s*$`, "i"), "");
  s = s
    .replace(/^(your\s+)?(quote|quotation|estimate|proposal)\s*(no\.?|#|ref\.?)?\s*[\w-]*\d[\w-]*\s*[-–:]?\s*/i, "")
    .replace(/^(your\s+)?(quote|quotation|estimate|proposal)\s*(for|re|-|–|:)?\s*/i, "")
    .replace(/\s*[-–:]\s*(quote|quotation|estimate)$/i, "")
    .trim();
  if (!s) return "Quote";
  return s.charAt(0).toUpperCase() + s.slice(1, 200);
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function nameFromAddress(addr: MailAddress): string {
  if (addr.name && !addr.name.includes("@")) return addr.name.slice(0, 120);
  const local = addr.email.split("@")[0] ?? addr.email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
    .slice(0, 120);
}

export type DetectedQuote = {
  recipient: MailAddress;
  description: string;
  amountPence: number | null;
};

/**
 * Decides whether a sent email looks like a quote being sent to a customer.
 * Deliberately conservative: a false positive means emailing someone who never got a quote.
 */
export function detectQuote(message: MailMessage, ownEmail: string, businessName?: string): DetectedQuote | null {
  if (message.quoteflowHeader) return null;
  const recipient = message.to.find((t) => t.email !== ownEmail.toLowerCase());
  if (!recipient || NO_REPLY.test(recipient.email)) return null;

  // Ignore internal emails between colleagues on a company domain.
  const ownDomain = ownEmail.split("@")[1]?.toLowerCase();
  const recipientDomain = recipient.email.split("@")[1]?.toLowerCase();
  if (ownDomain && ownDomain === recipientDomain && !PERSONAL_DOMAINS.has(ownDomain)) return null;

  const subjectHit = QUOTE_WORDS.test(message.subject);
  const attachmentHit = message.attachmentNames.some((n) => QUOTE_WORDS.test(n.replace(/[_-]/g, " ")));
  const firstPart = message.text.split(/\n\s*(on .+wrote:|-----original message-----|from:)/i)[0] ?? message.text;
  const amount = extractAmountPence(`${message.subject}\n${firstPart}`);
  const bodyHit = QUOTE_WORDS.test(firstPart.slice(0, 2000)) && amount != null;

  if (!(subjectHit || attachmentHit || bodyHit)) return null;
  if (NOT_A_QUOTE.test(message.subject)) return null;

  return {
    recipient,
    description: describeFromSubject(message.subject || "Quote", businessName),
    amountPence: amount,
  };
}
