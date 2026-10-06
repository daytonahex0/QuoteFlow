import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { runTick } from "@/lib/automation/tick";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Runs one pass of background work (sync mailboxes, send due follow-ups, flag overdue quotes).
 * Call every minute from a scheduler (e.g. Vercel Cron) with `Authorization: Bearer $CRON_SECRET`,
 * or run `npm run worker` as a long-lived process instead.
 */
async function handle(req: NextRequest) {
  const secret = env().CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  try {
    return NextResponse.json(await runTick());
  } catch (error) {
    logger.error("tick.failed", { error });
    return NextResponse.json({ error: "Tick failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
