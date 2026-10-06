import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, ChevronRight, Repeat, MailCheck } from "lucide-react";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getEntitlement } from "@/lib/billing/entitlements";
import { describeWhen, timeAgo } from "@/lib/schedule";
import { sequenceSummary } from "@/lib/sequence-summary";
import { renderTemplate } from "@/lib/templates";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { FlashToast } from "@/components/ui/toast";
import { NewSequenceButtons } from "@/components/app/sequence-editor";

export const metadata: Metadata = { title: "Follow-ups" };

export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const { org, user } = await requireOrg();
  const [sequences, upcoming, recent, ent] = await Promise.all([
    db.followUpSequence.findMany({
      where: { organisationId: org.id },
      include: { steps: { orderBy: { position: "asc" } }, _count: { select: { quotes: { where: { status: "FOLLOWING_UP" } } } } },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    }),
    db.scheduledFollowUp.findMany({
      where: { organisationId: org.id, status: "SCHEDULED", quote: { status: "FOLLOWING_UP" } },
      include: { step: true, quote: { include: { customer: true } } },
      orderBy: { scheduledFor: "asc" },
      take: 15,
    }),
    db.scheduledFollowUp.findMany({
      where: { organisationId: org.id, status: "SENT" },
      include: { quote: { include: { customer: true } } },
      orderBy: { sentAt: "desc" },
      take: 10,
    }),
    getEntitlement(org.id),
  ]);
  const senderName = org.senderName || user.name;

  return (
    <>
      {status === "sequence_deleted" && <FlashToast kind="success" message="Sequence deleted. Its quotes moved to your default sequence." />}
      <PageHeader title="Follow-ups" description="What goes out, and when. Follow-ups stop automatically the moment a customer replies." />

      <section aria-labelledby="upcoming" className="mb-8">
        <h2 id="upcoming" className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-500">Coming up</h2>
        {upcoming.length === 0 ? (
          <Card>
            <EmptyState icon={CalendarClock} title="No follow-ups scheduled" description="When you add a quote and start follow-ups, the next emails will be listed here.">
              <ButtonLink href="/quotes/new">Add a quote</ButtonLink>
            </EmptyState>
          </Card>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((f) => (
              <li key={f.id}>
                <Link href={`/quotes/${f.quoteId}`} className="flex items-center gap-3 rounded-2xl border border-ink-200/70 bg-white p-4 shadow-[var(--shadow-card)] hover:border-ink-300">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700"><CalendarClock className="size-5" aria-hidden /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink-900">{f.quote.customer.name} <span className="font-normal text-ink-500">· Day {f.delayDays}</span></p>
                    <p className="truncate text-sm text-ink-600">
                      {f.step
                        ? renderTemplate(f.step.subject, { customerName: f.quote.customer.name, businessName: org.name, amountPence: f.quote.amountPence, description: f.quote.description, senderName })
                        : "Follow-up"}
                    </p>
                    <p className="text-sm font-medium text-ink-700">{describeWhen(f.scheduledFor, org.timezone)}</p>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-ink-300" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="sequences" className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="sequences" className="text-xs font-bold uppercase tracking-wider text-ink-500">Sequences</h2>
          <span className="text-xs text-ink-400">{sequences.length} of {ent.limits.sequences}</span>
        </div>
        <ul className="grid gap-3 md:grid-cols-2">
          {sequences.map((s) => (
            <li key={s.id}>
              <Link href={`/follow-ups/${s.id}`} className="block h-full rounded-[var(--radius-card)] border border-ink-200/70 bg-white p-5 shadow-[var(--shadow-card)] hover:border-ink-300">
                <div className="flex items-start justify-between gap-3">
                  <p className="flex items-center gap-2 font-semibold text-ink-900"><Repeat className="size-4 text-brand-600" aria-hidden /> {s.name}</p>
                  {s.isDefault && <Badge tone="brand">Default</Badge>}
                </div>
                <p className="mt-2 text-[15px] font-medium text-ink-700">{sequenceSummary(s.steps)}</p>
                <p className="mt-1 text-sm text-ink-500">{s.steps.length} email{s.steps.length === 1 ? "" : "s"} · {s._count.quotes} active quote{s._count.quotes === 1 ? "" : "s"}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">Edit messages <ChevronRight className="size-4" aria-hidden /></span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <NewSequenceButtons allowed={sequences.length < ent.limits.sequences} starter={ent.plan === "STARTER"} />
        </div>
      </section>

      <section aria-labelledby="recent">
        <Card>
          <CardHeader title="Recently sent" />
          <CardBody className="pt-3">
            {recent.length === 0 ? (
              <p className="text-sm text-ink-500">Nothing sent yet.</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {recent.map((f) => (
                  <li key={f.id}>
                    <Link href={`/quotes/${f.quoteId}`} className="flex min-h-14 items-center gap-3 py-2 hover:bg-ink-50">
                      <MailCheck className="size-5 shrink-0 text-sky-600" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] text-ink-800">Follow-up sent to {f.quote.customer.name}</span>
                        <span className="block truncate text-sm text-ink-500">{f.subject}</span>
                      </span>
                      <span className="shrink-0 text-xs text-ink-400">{f.sentAt ? timeAgo(f.sentAt) : ""}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </section>
    </>
  );
}
