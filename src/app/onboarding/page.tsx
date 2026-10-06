import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { integrations } from "@/lib/env";
import { flashFrom } from "@/lib/flash";
import { BUSINESS_TYPES } from "@/lib/organisations";
import { TEMPLATE_STYLES } from "@/lib/sequences";
import { renderTemplate } from "@/lib/templates";
import { Logo } from "@/components/ui/logo";
import { FlashToast } from "@/components/ui/toast";
import { OnboardingWizard } from "@/components/app/onboarding-wizard";
import { logoutAction } from "@/app/actions/auth";

export const metadata: Metadata = { title: "Set up QuoteFlow", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const { org, user, membership } = await requireOrg({ allowIncompleteOnboarding: true });
  if (org.onboardingDoneAt) redirect("/dashboard");
  if (membership.role === "MEMBER") redirect("/dashboard");
  const [accounts, sequence] = await Promise.all([
    db.emailAccount.findMany({ where: { organisationId: org.id }, select: { email: true, provider: true, status: true } }),
    db.followUpSequence.findFirst({ where: { organisationId: org.id, isDefault: true } }),
  ]);
  const ctx = { customerName: "James Smith", businessName: org.name, amountPence: 320000, description: "bathroom renovation", senderName: user.name, signature: null };
  const styles = Object.entries(TEMPLATE_STYLES).map(([key, s]) => ({ key, label: s.label, description: s.description, preview: renderTemplate(s.first, ctx) }));
  const flash = flashFrom(params);

  return (
    <div className="min-h-dvh bg-ink-50">
      {flash && <FlashToast kind={flash.kind} message={flash.message} />}
      <header className="mx-auto flex h-16 max-w-xl items-center justify-between px-4">
        <Link href="/" aria-label="QuoteFlow home"><Logo /></Link>
        <form action={logoutAction}>
          <button type="submit" className="min-h-11 rounded-xl px-3 text-sm font-semibold text-ink-500 hover:text-ink-800">Log out</button>
        </form>
      </header>
      <main className="mx-auto max-w-xl px-4 pb-16">
        <OnboardingWizard
          initialStep={Math.min(Math.max(org.onboardingStep, 1), 5)}
          firstName={user.name.split(" ")[0] ?? ""}
          businessName={org.name}
          businessType={org.businessType}
          quoteSendMethod={org.quoteSendMethod}
          preset={sequence?.preset ?? "STANDARD"}
          autoFollowUp={org.autoFollowUpDetected}
          businessTypes={BUSINESS_TYPES.map((b) => ({ value: b.value, label: b.label }))}
          accounts={accounts}
          google={integrations.googleConfigured()}
          microsoft={integrations.microsoftConfigured()}
          styles={styles}
        />
      </main>
    </div>
  );
}
