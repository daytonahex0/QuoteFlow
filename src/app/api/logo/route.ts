import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

/** Serves the signed-in organisation's logo (stored in the database, validated on upload). */
export async function GET() {
  const session = await getSession();
  if (!session?.organisationId) return new NextResponse(null, { status: 404 });
  const membership = await db.membership.findFirst({ where: { userId: session.userId, organisationId: session.organisationId } });
  if (!membership) return new NextResponse(null, { status: 404 });
  const org = await db.organisation.findUnique({ where: { id: session.organisationId }, select: { logo: true, logoMimeType: true } });
  if (!org?.logo || !org.logoMimeType) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(org.logo), {
    headers: {
      "Content-Type": org.logoMimeType,
      "Cache-Control": "private, max-age=86400",
      "Content-Security-Policy": "default-src 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
