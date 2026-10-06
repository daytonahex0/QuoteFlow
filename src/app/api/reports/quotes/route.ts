import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getEntitlement } from "@/lib/billing/entitlements";

function csvCell(value: unknown): string {
  let s = value == null ? "" : value instanceof Date ? value.toISOString() : String(value);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Advanced reporting (Pro): quotes in a date range as CSV. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.organisationId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const membership = await db.membership.findFirst({ where: { userId: session.userId, organisationId: session.organisationId } });
  if (!membership) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const ent = await getEntitlement(membership.organisationId);
  if (!ent.limits.csvExport) return NextResponse.json({ error: "CSV reports are available on the Pro plan." }, { status: 403 });

  const from = new Date(`${req.nextUrl.searchParams.get("from") ?? "1970-01-01"}T00:00:00Z`);
  const to = new Date(`${req.nextUrl.searchParams.get("to") ?? new Date().toISOString().slice(0, 10)}T23:59:59Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return NextResponse.json({ error: "Invalid dates" }, { status: 400 });

  const quotes = await db.quote.findMany({
    where: { organisationId: membership.organisationId, sentAt: { gte: from, lte: to } },
    include: { customer: true, _count: { select: { followUps: { where: { status: "SENT" } } } } },
    orderBy: { sentAt: "asc" },
  });
  const header = ["Customer", "Email", "Description", "Amount (GBP)", "Status", "Source", "Sent", "Follow-ups sent", "Replied", "Won", "Lost"];
  const rows = quotes.map((q) => [
    q.customer.name, q.customer.email, q.description, q.amountPence != null ? (q.amountPence / 100).toFixed(2) : "", q.status, q.source, q.sentAt, q._count.followUps, q.repliedAt, q.wonAt, q.lostAt,
  ]);
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="quoteflow-quotes.csv"`, "Cache-Control": "no-store" },
  });
}
