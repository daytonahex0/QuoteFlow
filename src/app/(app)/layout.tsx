import { AppShell } from "@/components/app/app-shell";
import { MailboxBanner, SubscriptionBanner, VerifyEmailBanner } from "@/components/app/banners";
import { requireOrg } from "@/lib/auth/session";
import { entitlementFor } from "@/lib/billing/entitlements";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { org, user, membership } = await requireOrg();
  const [unread, expiredAccount] = await Promise.all([
    db.notification.count({ where: { userId: user.id, organisationId: org.id, readAt: null } }),
    db.emailAccount.findFirst({ where: { organisationId: org.id, status: { in: ["EXPIRED", "ERROR"] } }, select: { email: true } }),
  ]);
  const ent = entitlementFor(org.subscription);
  return (
    <AppShell
      orgName={org.name}
      hasLogo={Boolean(org.logoMimeType)}
      logoVersion={org.updatedAt.getTime().toString(36)}
      userName={user.name}
      userEmail={user.email}
      unread={unread}
      banners={
        <>
          <SubscriptionBanner state={ent.state} trialDaysLeft={ent.trialDaysLeft} canManage={membership.role !== "MEMBER"} />
          {expiredAccount && <MailboxBanner email={expiredAccount.email} />}
          {!user.emailVerifiedAt && <VerifyEmailBanner email={user.email} />}
        </>
      }
    >
      {children}
    </AppShell>
  );
}
