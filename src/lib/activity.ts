import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "./db";

type Client = PrismaClient | Prisma.TransactionClient;

export type ActivityType =
  | "quote.created"
  | "quote.detected"
  | "quote.updated"
  | "followups.started"
  | "followups.paused"
  | "followups.resumed"
  | "followups.stopped"
  | "followup.sent"
  | "followup.failed"
  | "customer.replied"
  | "quote.won"
  | "quote.lost"
  | "quote.reopened"
  | "quote.overdue";

export async function logActivity(
  input: { organisationId: string; quoteId?: string | null; actorUserId?: string | null; type: ActivityType; message: string; metadata?: Prisma.InputJsonValue },
  client: Client = db,
) {
  await client.activityEvent.create({
    data: {
      organisationId: input.organisationId,
      quoteId: input.quoteId ?? null,
      actorUserId: input.actorUserId ?? null,
      type: input.type,
      message: input.message.slice(0, 500),
      metadata: input.metadata,
    },
  });
}
