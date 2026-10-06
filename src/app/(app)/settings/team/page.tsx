import type { Metadata } from "next";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getEntitlement } from "@/lib/billing/entitlements";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InviteForm, TeamRowAction } from "@/components/app/settings-forms";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const { org, membership, user } = await requireOrg();
  const [members, invites, ent] = await Promise.all([
    db.membership.findMany({ where: { organisationId: org.id }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } }),
    db.invitation.findMany({ where: { organisationId: org.id, acceptedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }),
    getEntitlement(org.id),
  ]);
  const canManage = membership.role !== "MEMBER";
  const seatsLeft = ent.limits.seats - members.length - invites.length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Team members" description={`${members.length} of ${ent.limits.seats} user${ent.limits.seats === 1 ? "" : "s"} on your plan`} />
        <CardBody className="pt-3">
          <ul className="divide-y divide-ink-100">
            {members.map((m) => (
              <li key={m.id} className="flex min-h-16 items-center gap-3 py-2">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ink-100 font-bold text-ink-700" aria-hidden>{m.user.name.charAt(0).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink-900">{m.user.name}{m.userId === user.id && " (you)"}</span>
                  <span className="block truncate text-sm text-ink-500">{m.user.email}</span>
                </span>
                <Badge tone={m.role === "OWNER" ? "brand" : "neutral"}>{m.role.charAt(0) + m.role.slice(1).toLowerCase()}</Badge>
                {canManage && m.role !== "OWNER" && m.userId !== user.id && <TeamRowAction id={m.id} kind="member" />}
              </li>
            ))}
            {invites.map((i) => (
              <li key={i.id} className="flex min-h-16 items-center gap-3 py-2">
                <span className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-dashed border-ink-300 text-ink-400" aria-hidden>?</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink-700">{i.email}</span>
                  <span className="block text-sm text-ink-500">Invitation pending</span>
                </span>
                {canManage && <TeamRowAction id={i.id} kind="invite" />}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
      {canManage && (
        <Card>
          <CardHeader title="Invite someone" description={ent.limits.seats <= 1 ? "Multiple users are available on the Pro plan." : seatsLeft > 0 ? `You can invite ${seatsLeft} more.` : "You've used all the seats on your plan."} />
          <CardBody>
            <InviteForm disabled={seatsLeft <= 0} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
