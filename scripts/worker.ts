/**
 * Long-running background worker. Every minute it syncs connected mailboxes
 * (detecting quotes and replies), sends due follow-ups and flags overdue quotes.
 * Safe to run several copies — follow-ups are claimed with row locks.
 *
 *   npm run worker
 */
import { runTick } from "../src/lib/automation/tick";
import { db } from "../src/lib/db";
import { logger } from "../src/lib/logger";

const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 60_000);
let stopping = false;

async function loop() {
  logger.info("worker.started", { intervalMs: INTERVAL_MS });
  while (!stopping) {
    const started = Date.now();
    try {
      await runTick();
    } catch (error) {
      logger.error("worker.tick_failed", { error });
    }
    const wait = Math.max(1_000, INTERVAL_MS - (Date.now() - started));
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  await db.$disconnect();
  logger.info("worker.stopped");
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

void loop();
