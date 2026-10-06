import { db } from "../db";
import { logger } from "../logger";
import { syncEmailAccount } from "../email/sync";
import { flagOverdueQuotes, processDueFollowUps, recoverStaleLocks } from "./followups";

const SYNC_INTERVAL_MS = 4 * 60_000;

/**
 * One pass of all background work. Called every minute by the worker process
 * or by a scheduler hitting /api/cron/tick. Safe to run concurrently.
 */
export async function runTick(now = new Date()) {
  const started = Date.now();
  await recoverStaleLocks(now);

  // Sync mailboxes before sending so fresh replies stop follow-ups first.
  const accounts = await db.emailAccount.findMany({
    where: { status: "CONNECTED", OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: new Date(now.getTime() - SYNC_INTERVAL_MS) } }] },
    select: { id: true },
    orderBy: { lastSyncedAt: { sort: "asc", nulls: "first" } },
    take: 20,
  });
  for (const a of accounts) await syncEmailAccount(a.id, now);

  const sending = await processDueFollowUps(now);
  const overdue = await flagOverdueQuotes(now);

  if (now.getUTCMinutes() % 30 === 0) await cleanup(now);

  const summary = { synced: accounts.length, ...sending, overdue, ms: Date.now() - started };
  logger.info("tick.completed", summary);
  return summary;
}

async function cleanup(now: Date) {
  await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
  await db.verificationToken.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 7 * 86400_000) } } });
  await db.rateLimit.deleteMany({ where: { resetAt: { lt: now } } });
}
