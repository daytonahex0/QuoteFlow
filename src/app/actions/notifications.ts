"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { runAction } from "@/lib/action";
import type { ActionResult } from "@/lib/errors";
import { requireOrg } from "@/lib/auth/session";

export async function markNotificationReadAction(id: string): Promise<ActionResult> {
  return runAction("notification_read", async () => {
    const { org, user } = await requireOrg();
    await db.notification.updateMany({ where: { id, userId: user.id, organisationId: org.id, readAt: null }, data: { readAt: new Date() } });
    revalidatePath("/notifications");
  });
}

export async function markAllNotificationsReadAction(): Promise<ActionResult> {
  return runAction("notifications_read_all", async () => {
    const { org, user } = await requireOrg();
    await db.notification.updateMany({ where: { userId: user.id, organisationId: org.id, readAt: null }, data: { readAt: new Date() } });
    revalidatePath("/", "layout");
    return { ok: true, message: "All caught up." };
  });
}
