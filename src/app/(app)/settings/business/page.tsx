import type { Metadata } from "next";
import { requireOrg } from "@/lib/auth/session";
import { BUSINESS_TYPES } from "@/lib/organisations";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { BusinessForm } from "@/components/app/settings-forms";

export const metadata: Metadata = { title: "Business settings" };

export default async function BusinessSettingsPage() {
  const { org, membership } = await requireOrg();
  const canEdit = membership.role !== "MEMBER";
  return (
    <Card>
      <CardHeader title="Business" description={canEdit ? "These details appear in your follow-up emails." : "Only the owner or an admin can change these details."} />
      <CardBody>
        <fieldset disabled={!canEdit} className="disabled:opacity-70">
          <BusinessForm
            hasLogo={Boolean(org.logoMimeType)}
            logoVersion={org.updatedAt.getTime().toString(36)}
            businessTypes={BUSINESS_TYPES.map((b) => ({ value: b.value, label: b.label }))}
            org={{
              name: org.name,
              businessType: org.businessType,
              senderName: org.senderName ?? "",
              address: org.address ?? "",
              website: org.website ?? "",
              phone: org.phone ?? "",
              signature: org.signature ?? "",
            }}
          />
        </fieldset>
      </CardBody>
    </Card>
  );
}
