import type { Metadata } from "next";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FollowUpSettingsForm } from "@/components/app/settings-forms";

export const metadata: Metadata = { title: "Follow-up settings" };

const COMMON = ["Europe/London", "Europe/Dublin", "Europe/Paris", "Europe/Berlin", "Europe/Madrid", "America/New_York", "America/Chicago", "America/Los_Angeles", "Australia/Sydney", "Asia/Dubai"];

export default async function FollowUpSettingsPage() {
  const { org, membership } = await requireOrg();
  const sequences = await db.followUpSequence.findMany({ where: { organisationId: org.id }, select: { id: true, name: true, isDefault: true }, orderBy: { createdAt: "asc" } });
  const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : COMMON;
  const timezones = [...new Set([org.timezone, ...COMMON, ...all])];
  return (
    <Card>
      <CardHeader title="Follow-ups" description="When and how QuoteFlow sends follow-ups. Follow-ups always stop when a customer replies." />
      <CardBody>
        <fieldset disabled={membership.role === "MEMBER"}>
          <FollowUpSettingsForm org={org} sequences={sequences} timezones={timezones} />
        </fieldset>
      </CardBody>
    </Card>
  );
}
