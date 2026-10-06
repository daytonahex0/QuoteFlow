import type { Config } from "@netlify/functions";

/**
 * Runs QuoteFlow's background automation every minute: mailbox sync,
 * due follow-ups and overdue checks. Delegates to the app's protected
 * /api/cron/tick route so all logic lives in one place.
 */
export default async () => {
  const base = process.env.APP_URL ?? process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.error("automation-tick: APP_URL/URL or CRON_SECRET is not set");
    return;
  }
  const res = await fetch(new URL("/api/cron/tick", base), { headers: { Authorization: `Bearer ${secret}` } });
  console.log(`automation-tick: ${res.status} ${await res.text()}`);
};

export const config: Config = { schedule: "* * * * *" };
