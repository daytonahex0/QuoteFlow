import { formatMoney } from "./money";

export const TEMPLATE_VARIABLES = [
  { key: "customer_name", label: "Customer name" },
  { key: "customer_first_name", label: "Customer first name" },
  { key: "business_name", label: "Business name" },
  { key: "quote_amount", label: "Quote amount" },
  { key: "quote_description", label: "Quote description" },
  { key: "sender_name", label: "Your name" },
  { key: "signature", label: "Signature" },
] as const;

export type TemplateContext = {
  customerName: string;
  businessName: string;
  amountPence: number | null;
  description: string;
  senderName: string;
  signature?: string | null;
};

export function firstName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first || "there";
}

/** Replaces {{variables}} in a template. Unknown variables are left untouched so users can spot typos in preview. */
export function renderTemplate(template: string, ctx: TemplateContext): string {
  const values: Record<string, string> = {
    customer_name: ctx.customerName.trim() || "there",
    customer_first_name: firstName(ctx.customerName),
    business_name: ctx.businessName,
    quote_amount: ctx.amountPence != null ? formatMoney(ctx.amountPence) : "the amount quoted",
    quote_description: ctx.description.trim() || "the work",
    sender_name: ctx.senderName,
    signature: ctx.signature?.trim() || `${ctx.senderName}\n${ctx.businessName}`,
  };
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, key: string) => values[key] ?? match);
}

export function findUnknownVariables(template: string): string[] {
  const known = new Set<string>(TEMPLATE_VARIABLES.map((v) => v.key));
  const unknown = new Set<string>();
  for (const m of template.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)) if (!known.has(m[1]!)) unknown.add(m[1]!);
  return [...unknown];
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Converts a plain-text message into safe, simple HTML (user text is always escaped). */
export function textToHtml(text: string): string {
  const paragraphs = text.trim().split(/\n{2,}/);
  const inner = paragraphs
    .map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1f2933">${inner}</div>`;
}

