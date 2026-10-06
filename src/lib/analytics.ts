import { db } from "./db";

export type AnalyticsRange = { from: Date; to: Date };

/**
 * Simple, honest metrics computed from real account data only.
 * "Revenue recovered" = value of won quotes that received at least one follow-up before being won.
 */
export async function analyticsFor(organisationId: string, { from, to }: AnalyticsRange) {
  const inRange = { gte: from, lte: to };
  const [quotesSent, followUpsSent, followedUpQuotes, wonQuotes, valueAgg, replied] = await Promise.all([
    db.quote.count({ where: { organisationId, sentAt: inRange } }),
    db.scheduledFollowUp.count({ where: { organisationId, status: "SENT", sentAt: inRange } }),
    db.quote.findMany({
      where: { organisationId, followUps: { some: { status: "SENT", sentAt: inRange } } },
      select: { id: true, repliedAt: true, status: true },
    }),
    db.quote.findMany({
      where: { organisationId, status: "WON", wonAt: inRange },
      select: { amountPence: true, wonAt: true, followUps: { where: { status: "SENT" }, select: { sentAt: true } } },
    }),
    db.quote.aggregate({ where: { organisationId, sentAt: inRange }, _sum: { amountPence: true } }),
    db.quote.findMany({ where: { organisationId, repliedAt: inRange }, select: { sentAt: true, repliedAt: true } }),
  ]);

  const followedUpReplied = followedUpQuotes.filter((q) => q.repliedAt).length;
  const recovered = wonQuotes
    .filter((q) => q.followUps.some((f) => f.sentAt && q.wonAt && f.sentAt <= q.wonAt))
    .reduce((sum, q) => sum + (q.amountPence ?? 0), 0);
  const responseHours = replied.filter((r) => r.repliedAt).map((r) => (r.repliedAt!.getTime() - r.sentAt.getTime()) / 3600_000);
  const avgResponseHours = responseHours.length ? responseHours.reduce((a, b) => a + b, 0) / responseHours.length : null;

  return {
    quotesSent,
    quotesFollowedUp: followedUpQuotes.length,
    followUpsSent,
    replyRate: followedUpQuotes.length ? followedUpReplied / followedUpQuotes.length : null,
    quotesWon: wonQuotes.length,
    quoteValue: valueAgg._sum.amountPence ?? 0,
    revenueRecovered: recovered,
    avgResponseHours,
  };
}

export function formatDuration(hours: number | null): string {
  if (hours == null) return "—";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours)} hr${Math.round(hours) === 1 ? "" : "s"}`;
  return `${(hours / 24).toFixed(1)} days`;
}
