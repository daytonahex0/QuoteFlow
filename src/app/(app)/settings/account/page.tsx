import type { Metadata } from "next";
import { Download } from "lucide-react";
import { requireOrg } from "@/lib/auth/session";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DeleteAccountForm, PasswordForm, ProfileForm } from "@/components/app/settings-forms";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const { user, membership } = await requireOrg();
  const hasPassword = Boolean(user.passwordHash);
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Profile" />
        <CardBody><ProfileForm name={user.name} email={user.email} hasPassword={hasPassword} /></CardBody>
      </Card>
      <Card>
        <CardHeader title="Password" description={hasPassword ? "Changing your password signs you out on other devices." : "You sign in with Google or Microsoft. You can also set a password."} />
        <CardBody><PasswordForm hasPassword={hasPassword} /></CardBody>
      </Card>
      <Card>
        <CardHeader title="Your data" description="Download everything QuoteFlow stores about your business as a JSON file." />
        <CardBody>
          <a href="/api/account/export" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 font-semibold text-ink-800 hover:bg-ink-50">
            <Download className="size-4" aria-hidden /> Export my data
          </a>
        </CardBody>
      </Card>
      <Card className="border-rose-200">
        <CardHeader title="Delete account" />
        <CardBody><DeleteAccountForm isOwner={membership.role === "OWNER"} hasPassword={hasPassword} /></CardBody>
      </Card>
    </div>
  );
}
