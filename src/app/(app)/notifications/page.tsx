import type { Metadata } from "next";
import { Bell } from "lucide-react";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { NotificationList } from "@/components/app/notification-list";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const { org, user } = await requireOrg();
  const notifications = await db.notification.findMany({
    where: { userId: user.id, organisationId: org.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Notifications" description="Replies, wins and anything that needs your attention." />
      {notifications.length === 0 ? (
        <Card>
          <EmptyState icon={Bell} title="You're all caught up" description="We'll let you know here (and by email) when a customer replies or something needs your attention." />
        </Card>
      ) : (
        <NotificationList
          items={notifications.map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, href: n.href, read: Boolean(n.readAt), createdAt: n.createdAt.toISOString() }))}
        />
      )}
    </div>
  );
}
