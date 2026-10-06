import { NextResponse, type NextRequest } from "next/server";
import { env, integrations } from "@/lib/env";
import { handleStripeEvent, stripe } from "@/lib/billing/stripe";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/** Stripe webhooks — signature verified against the raw body before anything is trusted. */
export async function POST(req: NextRequest) {
  if (!integrations.stripeConfigured()) return NextResponse.json({ error: "Billing not configured" }, { status: 503 });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  const raw = await req.text();
  let event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, env().STRIPE_WEBHOOK_SECRET!);
  } catch (error) {
    logger.warn("stripe.webhook_invalid_signature", { error });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  try {
    const result = await handleStripeEvent(event);
    logger.info("stripe.webhook_processed", { type: event.type, eventId: event.id, duplicate: result.duplicate });
    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error("stripe.webhook_failed", { type: event.type, eventId: event.id, error });
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
