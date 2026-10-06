import { DateTime } from "luxon";
import { db } from "./db";

export type DailyPoint = { date: string; label: string; sent: number; replies: number };

/** Per-day follow-ups sent and customer replies, in the business's time zone. */
export async function dailyActivity(organisationId: string, timezone: string, days: number, end = new Date()): Promise<DailyPoint[]> {
  const endLocal = DateTime.fromJSDate(end, { zone: timezone }).endOf("day");
  const startLocal = endLocal.minus({ days: days - 1 }).startOf("day");
  const [sent, replies] = await Promise.all([
    db.scheduledFollowUp.findMany({
      where: { organisationId, status: "SENT", sentAt: { gte: startLocal.toJSDate(), lte: endLocal.toJSDate() } },
      select: { sentAt: true },
    }),
    db.quote.findMany({
      where: { organisationId, repliedAt: { gte: startLocal.toJSDate(), lte: endLocal.toJSDate() } },
      select: { repliedAt: true },
    }),
  ]);
  const points = new Map<string, DailyPoint>();
  for (let d = startLocal; d <= endLocal; d = d.plus({ days: 1 })) {
    const key = d.toISODate()!;
    points.set(key, { date: key, label: d.toFormat("d LLL"), sent: 0, replies: 0 });
  }
  const keyOf = (at: Date) => DateTime.fromJSDate(at, { zone: timezone }).toISODate()!;
  for (const s of sent) if (s.sentAt) points.get(keyOf(s.sentAt))!.sent++;
  for (const r of replies) if (r.repliedAt) points.get(keyOf(r.repliedAt))!.replies++;
  return [...points.values()];
}

export async function dashboardStats(organisationId: string) {
  const since = new Date(Date.now() - 30 * 86400_000);
  const open = { in: ["NEW", "FOLLOWING_UP", "PAUSED", "REPLIED"] as ("NEW" | "FOLLOWING_UP" | "PAUSED" | "REPLIED")[] };
  const [openValue, replied, followingUp, repliesCount, won, sent, totalQuotes] = await Promise.all([
    db.quote.aggregate({ where: { organisationId, status: open }, _sum: { amountPence: true } }),
    db.quote.aggregate({ where: { organisationId, status: "REPLIED" }, _sum: { amountPence: true } }),
    db.quote.count({ where: { organisationId, status: "FOLLOWING_UP" } }),
    db.quote.count({ where: { organisationId, repliedAt: { gte: since } } }),
    db.quote.aggregate({ where: { organisationId, status: "WON", wonAt: { gte: since } }, _count: true, _sum: { amountPence: true } }),
    db.scheduledFollowUp.count({ where: { organisationId, status: "SENT", sentAt: { gte: since } } }),
    db.quote.count({ where: { organisationId } }),
  ]);
  return {
    quoteValue: openValue._sum.amountPence ?? 0,
    potentialRevenue: replied._sum.amountPence ?? 0,
    followingUp,
    replies: repliesCount,
    won: won._count,
    wonValue: won._sum.amountPence ?? 0,
    followUpsSent: sent,
    totalQuotes,
  };
}
