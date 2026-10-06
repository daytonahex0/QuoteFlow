import Stripe from "stripe";
import type { Plan, SubscriptionStatus } from "@prisma/client";
import { db } from "../db";
import { env, appUrl, integrations } from "../env";
import { UserError } from "../errors";
import { logger } from "../logger";
import { notifyOrganisation } from "../notifications";

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (!integrations.stripeConfigured()) throw new UserError("Billing isn't set up yet. Please contact support.");
  client ??= new Stripe(env().STRIPE_SECRET_KEY!, { appInfo: { name: "QuoteFlow" } });
  return client;
}

export function priceIdFor(plan: Plan): string {
  const e = env();
  const id = { STARTER: e.STRIPE_PRICE_STARTER, GROWTH: e.STRIPE_PRICE_GROWTH, PRO: e.STRIPE_PRICE_PRO }[plan];
  if (!id) throw new UserError("Billing isn't set up yet. Please contact support.");
  return id;
}

export function planForPrice(priceId: string | null | undefined): Plan | null {
  const e = env();
  if (priceId === e.STRIPE_PRICE_STARTER) return "STARTER";
  if (priceId === e.STRIPE_PRICE_GROWTH) return "GROWTH";
  if (priceId === e.STRIPE_PRICE_PRO) return "PRO";
  return null;
}

export function mapStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "trialing":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "past_due":
      return "PAST_DUE";
    case "unpaid":
      return "UNPAID";
    case "incomplete":
      return "INCOMPLETE";
    default:
      return "CANCELED"; // canceled, incomplete_expired, paused
  }
}

async function ensureCustomer(organisationId: string, email: string) {
  const sub = await db.subscription.findUnique({ where: { organisationId }, include: { organisation: true } });
  if (sub?.stripeCustomerId) return sub.stripeCustomerId;
  const customer = await stripe().customers.create({
    email,
    name: sub?.organisation.name,
    metadata: { organisationId },
  });
  await db.subscription.upsert({
    where: { organisationId },
    create: { organisationId, stripeCustomerId: customer.id, status: "INCOMPLETE", plan: "STARTER" },
    update: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

const LIVE_STATUSES = new Set(["ACTIVE", "TRIALING", "PAST_DUE"]);

/**
 * Starts a subscription (Stripe Checkout) or changes plan on an existing one.
 * Returns a URL to redirect to, or null when the change was applied in place.
 */
export async function checkoutOrChangePlan(organisationId: string, plan: Plan, userEmail: string): Promise<string | null> {
  const sub = await db.subscription.findUnique({ where: { organisationId } });
  const price = priceIdFor(plan);

  if (sub?.stripeSubscriptionId && LIVE_STATUSES.has(sub.status)) {
    const current = await stripe().subscriptions.retrieve(sub.stripeSubscriptionId);
    const item = current.items.data[0];
    if (!item) throw new Error("Subscription has no items");
    if (item.price.id === price && !current.cancel_at_period_end) return null;
    const updated = await stripe().subscriptions.update(sub.stripeSubscriptionId, {
      items: [{ id: item.id, price }],
      proration_behavior: "create_prorations",
      cancel_at_period_end: false,
      metadata: { organisationId },
    });
    await syncSubscription(updated);
    return null;
  }

  const customer = await ensureCustomer(organisationId, userEmail);
  // Carry over remaining app-trial days so upgrading early doesn't cut the trial short.
  const trialEnd =
    sub?.status === "TRIALING" && !sub.stripeSubscriptionId && sub.trialEndsAt && sub.trialEndsAt.getTime() > Date.now() + 48 * 3600_000
      ? Math.floor(sub.trialEndsAt.getTime() / 1000)
      : undefined;
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price, quantity: 1 }],
    client_reference_id: organisationId,
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    subscription_data: { metadata: { organisationId }, ...(trialEnd ? { trial_end: trialEnd } : {}) },
    metadata: { organisationId },
    success_url: appUrl("/settings/billing?checkout=success"),
    cancel_url: appUrl("/settings/billing?checkout=cancelled"),
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

export async function cancelSubscription(organisationId: string) {
  const sub = await db.subscription.findUnique({ where: { organisationId } });
  if (!sub?.stripeSubscriptionId) throw new UserError("You don't have a paid subscription to cancel.");
  const updated = await stripe().subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: true });
  await syncSubscription(updated);
}

export async function resumeSubscription(organisationId: string) {
  const sub = await db.subscription.findUnique({ where: { organisationId } });
  if (!sub?.stripeSubscriptionId) throw new UserError("There's no subscription to resume.");
  const updated = await stripe().subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: false });
  await syncSubscription(updated);
}

export async function portalUrl(organisationId: string) {
  const sub = await db.subscription.findUnique({ where: { organisationId } });
  if (!sub?.stripeCustomerId) throw new UserError("Choose a plan first — then you can manage billing here.");
  const session = await stripe().billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: appUrl("/settings/billing"),
  });
  return session.url;
}

/** Writes Stripe's view of a subscription to our database (Stripe is the source of truth). */
export async function syncSubscription(s: Stripe.Subscription) {
  const organisationId = s.metadata?.organisationId;
  const customerId = typeof s.customer === "string" ? s.customer : s.customer.id;
  const existing = organisationId
    ? await db.subscription.findUnique({ where: { organisationId } })
    : await db.subscription.findFirst({ where: { OR: [{ stripeSubscriptionId: s.id }, { stripeCustomerId: customerId }] } });
  const orgId = organisationId ?? existing?.organisationId;
  if (!orgId) {
    logger.warn("stripe.subscription_unmatched", { subscriptionId: s.id });
    return;
  }
  const item = s.items.data[0];
  const plan = planForPrice(item?.price.id) ?? existing?.plan ?? "STARTER";
  // `current_period_end` moved onto subscription items in newer Stripe API versions.
  const periodEnd =
    (item as unknown as { current_period_end?: number } | undefined)?.current_period_end ??
    (s as unknown as { current_period_end?: number }).current_period_end;
  const status = mapStatus(s.status);
  const data = {
    plan,
    status,
    stripeCustomerId: customerId,
    stripeSubscriptionId: s.id,
    stripePriceId: item?.price.id ?? null,
    trialEndsAt: s.trial_end ? new Date(s.trial_end * 1000) : status === "TRIALING" ? existing?.trialEndsAt : null,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
    cancelAtPeriodEnd: s.cancel_at_period_end,
    paymentFailedAt: status === "PAST_DUE" ? (existing?.paymentFailedAt ?? new Date()) : null,
  };
  await db.subscription.upsert({ where: { organisationId: orgId }, create: { organisationId: orgId, ...data }, update: data });
}

export async function handleStripeEvent(event: Stripe.Event) {
  // Idempotency: ignore events we've already processed.
  try {
    await db.webhookEvent.create({ data: { id: event.id, source: "stripe", type: event.type } });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return { duplicate: true };
    throw error;
  }
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          const id = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          await syncSubscription(await stripe().subscriptions.retrieve(id));
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        const sub = customerId ? await db.subscription.findUnique({ where: { stripeCustomerId: customerId } }) : null;
        if (sub) {
          await db.subscription.update({ where: { id: sub.id }, data: { status: "PAST_DUE", paymentFailedAt: sub.paymentFailedAt ?? new Date() } });
          await notifyOrganisation({
            organisationId: sub.organisationId,
            type: "BILLING",
            title: "Your payment didn't go through",
            body: "Please update your payment details within 7 days to keep your follow-ups running.",
            href: "/settings/billing",
          });
        }
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (customerId) await db.subscription.updateMany({ where: { stripeCustomerId: customerId }, data: { paymentFailedAt: null } });
        break;
      }
      default:
        break;
    }
  } catch (error) {
    // Allow Stripe to retry by forgetting we saw this event.
    await db.webhookEvent.delete({ where: { id: event.id } }).catch(() => undefined);
    throw error;
  }
  return { duplicate: false };
}
