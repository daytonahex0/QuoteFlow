import { z } from "zod";

/**
 * Server-only environment configuration. Secrets are never imported by client
 * components — only values prefixed NEXT_PUBLIC_ reach the browser, and we use none.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  ENCRYPTION_KEY: z.string().min(1, "ENCRYPTION_KEY is required (32 bytes, base64)"),
  CRON_SECRET: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  INBOUND_DOMAIN: z.string().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_TENANT: z.string().default("common"),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_STARTER: z.string().optional(),
  STRIPE_PRICE_GROWTH: z.string().optional(),
  STRIPE_PRICE_PRO: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration — ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export const integrations = {
  googleConfigured: () => Boolean(env().GOOGLE_CLIENT_ID && env().GOOGLE_CLIENT_SECRET),
  microsoftConfigured: () => Boolean(env().MICROSOFT_CLIENT_ID && env().MICROSOFT_CLIENT_SECRET),
  stripeConfigured: () =>
    Boolean(
      env().STRIPE_SECRET_KEY &&
        env().STRIPE_WEBHOOK_SECRET &&
        env().STRIPE_PRICE_STARTER &&
        env().STRIPE_PRICE_GROWTH &&
        env().STRIPE_PRICE_PRO,
    ),
  resendConfigured: () => Boolean(env().RESEND_API_KEY && env().EMAIL_FROM),
  inboundConfigured: () => Boolean(env().INBOUND_DOMAIN && env().RESEND_WEBHOOK_SECRET),
};

export function appUrl(path = "") {
  return new URL(path, env().APP_URL).toString();
}
