import { NextResponse, type NextRequest } from "next/server";
import { createHmac } from "node:crypto";
import { db } from "@/lib/db";
import { env, integrations } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { parseReplyToAddress } from "@/lib/automation/followups";
import { handleCustomerReply } from "@/lib/automation/replies";
import { parseAddressList } from "@/lib/email/mailbox";

export const runtime = "nodejs";

/**
 * Inbound email webhook (Resend "email.received", delivered via Svix).
 * Customers replying to follow-ups sent by QuoteFlow (for businesses without a
 * connected mailbox) reach reply+<quote>.<sig>@INBOUND_DOMAIN; we stop follow-ups.
 */
function verifySvix(raw: string, headers: Headers): boolean {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatures = headers.get("svix-signature");
  if (!id || !timestamp || !signatures) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false; // replay protection
  const secret = Buffer.from(env().RESEND_WEBHOOK_SECRET!.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", secret).update(`${id}.${timestamp}.${raw}`).digest("base64");
  return signatures.split(" ").some((s) => safeEqual(s.split(",")[1] ?? "", expected));
}

type InboundPayload = {
  type?: string;
  data?: { email_id?: string; from?: string; to?: string[] | string; subject?: string; text?: string; created_at?: string };
};

export async function POST(req: NextRequest) {
  if (!integrations.inboundConfigured()) return NextResponse.json({ error: "Inbound email not configured" }, { status: 503 });
  const raw = await req.text();
  if (!verifySvix(raw, req.headers)) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  let payload: InboundPayload;
  try {
    payload = JSON.parse(raw) as InboundPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (payload.type && payload.type !== "email.received") return NextResponse.json({ ignored: true });
  const data = payload.data ?? {};
  const recipients = Array.isArray(data.to) ? data.to : data.to ? [data.to] : [];
  const quoteId = recipients.map((r) => parseReplyToAddress(parseAddressList(r)[0]?.email ?? r)).find(Boolean);
  if (!quoteId) return NextResponse.json({ ignored: true });

  const quote = await db.quote.findUnique({ where: { id: quoteId }, include: { customer: true } });
  if (!quote) return NextResponse.json({ ignored: true });
  const from = parseAddressList(data.from)[0];

  await handleCustomerReply({
    organisationId: quote.organisationId,
    quoteId: quote.id,
    source: "inbound",
    message: {
      providerMessageId: data.email_id ? `inbound:${data.email_id}` : null,
      threadId: null,
      fromEmail: from?.email ?? quote.customer.email,
      fromName: from?.name ?? null,
      toEmail: recipients[0] ?? "",
      subject: data.subject ?? "(no subject)",
      text: data.text ?? "",
      date: data.created_at ? new Date(data.created_at) : new Date(),
    },
  });
  logger.info("inbound.reply_processed", { organisationId: quote.organisationId, quoteId: quote.id });
  return NextResponse.json({ received: true });
}
