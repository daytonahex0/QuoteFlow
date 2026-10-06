import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { audit } from "@/lib/logger";

/** GDPR data export: everything stored for the signed-in user's organisation (secrets excluded). */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const membership = await db.membership.findFirst({
    where: { userId: session.userId, ...(session.organisationId ? { organisationId: session.organisationId } : {}) },
  });
  if (!membership) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const orgId = membership.organisationId;
  const isAdmin = membership.role !== "MEMBER";

  const [org, customers, quotes, sequences, messages, notifications, accounts] = await Promise.all([
    db.organisation.findUnique({
      where: { id: orgId },
      select: { name: true, businessType: true, address: true, website: true, phone: true, signature: true, senderName: true, timezone: true, sendingStartHour: true, sendingEndHour: true, sendOnWeekends: true, maxDailyEmails: true, createdAt: true, subscription: { select: { plan: true, status: true, trialEndsAt: true, currentPeriodEnd: true } } },
    }),
    isAdmin ? db.customer.findMany({ where: { organisationId: orgId } }) : [],
    isAdmin ? db.quote.findMany({ where: { organisationId: orgId }, include: { followUps: { select: { position: true, status: true, scheduledFor: true, sentAt: true, subject: true } } } }) : [],
    isAdmin ? db.followUpSequence.findMany({ where: { organisationId: orgId }, include: { steps: true } }) : [],
    isAdmin ? db.emailMessage.findMany({ where: { organisationId: orgId } }) : [],
    db.notification.findMany({ where: { organisationId: orgId, userId: session.userId } }),
    isAdmin ? db.emailAccount.findMany({ where: { organisationId: orgId }, select: { provider: true, email: true, status: true, connectedAt: true, lastSyncedAt: true } }) : [],
  ]);
  audit("data.exported", { userId: session.userId, organisationId: orgId });
  const body = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      user: { name: session.user.name, email: session.user.email, createdAt: session.user.createdAt, role: membership.role },
      organisation: org,
      emailAccounts: accounts,
      customers,
      quotes,
      sequences,
      messages,
      notifications,
    },
    null,
    2,
  );
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="quoteflow-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
