import type { Metadata } from "next";
import { requireOrg } from "@/lib/auth/session";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { NotificationSettingsForm } from "@/components/app/settings-forms";

export const metadata: Metadata = { title: "Notification settings" };

export default async function NotificationSettingsPage() {
  const { org, membership } = await requireOrg();
  return (
    <Card>
      <CardHeader title="Notifications" description="Choose what we notify your team about." />
      <CardBody>
        <fieldset disabled={membership.role === "MEMBER"}>
          <NotificationSettingsForm org={org} />
        </fieldset>
      </CardBody>
    </Card>
  );
}
