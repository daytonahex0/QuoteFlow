import { db } from "./db";
import { UserError } from "./errors";

/**
 * Fixed-window rate limiter backed by Postgres so it works across multiple
 * server instances. Returns true when the request is allowed.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSeconds * 1000);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "resetAt", "updatedAt")
    VALUES (${key}, 1, ${resetAt}, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."resetAt" < ${now} THEN 1 ELSE "RateLimit"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" < ${now} THEN ${resetAt} ELSE "RateLimit"."resetAt" END,
      "updatedAt" = ${now}
    RETURNING "count"`;
  return (rows[0]?.count ?? 0) <= limit;
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number) {
  if (!(await rateLimit(key, limit, windowSeconds))) {
    throw new UserError("Too many attempts. Please wait a few minutes and try again.", "rate_limited");
  }
}
