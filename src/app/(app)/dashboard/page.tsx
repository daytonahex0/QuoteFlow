import type { Metadata } from "next";
import Link from "next/link";
import { DateTime } from "luxon";
import { Activity, ArrowRight, CheckCircle2, FileText, Inbox, Plus, Sparkles } from "lucide-react";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { dailyActivity, dashboardStats } from "@/lib/dashboard";
import { formatMoney } from "@/lib/money";
import { timeAgo, describeWhen } from "@/lib/schedule";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FlashToast } from "@/components/ui/toast";
import { Stat } from "@/components/app/stat";
import { ActivityChart } from "@/components/app/activity-chart";
import { flashFrom } from "@/lib/flash";

export const metadata: Metadata = { title: "Dashboard" };

function greeting(timezone: string) {
  const hour = DateTime.now().setZone(timezone).hour;
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const { org, user } = await requireOrg();
  const soon = new Date(Date.now() + 2 * 86400_000);
  const [stats, attention, upcoming, activity, chart, accounts] = await Promise.all([
    dashboardStats(org.id),
    db.quote.findMany({
      where: { organisationId: org.id, needsAttention: true },
      include: { customer: { select: { name: true } } },
      orderBy: [{ repliedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
      take: 6,
    }),
    db.quote.findMany({
      where: { organisationId: org.id, status: "FOLLOWING_UP", needsAttention: false, nextFollowUpAt: { lte: soon } },
      include: { customer: { select: { name: true } } },
      orderBy: { nextFollowUpAt: "asc" },
      take: 4,
    }),
    db.activityEvent.findMany({ where: { organisationId: org.id }, orderBy: { createdAt: "desc" }, take: 8 }),
    dailyActivity(org.id, org.timezone, 14),
    db.emailAccount.count({ where: { organisationId: org.id } }),
  ]);
  const newQuotes = await db.quote.count({ where: { organisationId: org.id, status: "NEW" } });
  const flash = params.welcome ? { kind: "success" as const, message: "You're all set. QuoteFlow is ready to chase your quotes." } : flashFrom(params);
  const firstName = user.name.split(" ")[0];

  if (stats.totalQuotes === 0) {
    return (
      <>
        {flash && <FlashToast kind={flash.kind} message={flash.message} />}
        <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-[1.75rem]">{greeting(org.timezone)}, {firstName}</h1>
        <p className="mt-1 text-[15px] text-ink-500">Let’s get your first quote followed up.</p>
        <Card className="mt-6">
          <EmptyState
            icon={Inbox}
            title="No quotes yet"
            description={
              accounts
                ? "Your inbox is connected. QuoteFlow checks for new quotes every few minutes — or add one yourself right now."
                : "Your first quote is waiting. Connect your email and QuoteFlow will automatically find quotes that need following up."
            }
          >
            {accounts ? (
              <ButtonLink href="/quotes/new"><Plus className="size-5" aria-hidden /> Add a quote</ButtonLink>
            ) : (
              <>
                <ButtonLink href="/settings/email">Connect email</ButtonLink>
                <ButtonLink href="/quotes/new" variant="outline">Add a quote manually</ButtonLink>
              </>
            )}
          </EmptyState>
        </Card>
        <Card className="mt-4">
          <CardHeader title="How QuoteFlow works" />
          <CardBody>
            <ol className="grid gap-3 sm:grid-cols-3">
              {[
                ["Add or detect a quote", "Connect your inbox or add quotes by hand."],
                ["We follow up for you", "Friendly emails go out on your schedule."],
                ["They reply, we stop", "You get notified and follow-ups stop instantly."],
              ].map(([t, b], i) => (
                <li key={t} className="rounded-2xl bg-ink-50 p-4">
                  <p className="text-sm font-bold text-brand-700">Step {i + 1}</p>
                  <p className="mt-1 font-semibold text-ink-900">{t}</p>
                  <p className="text-sm text-ink-600">{b}</p>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </>
    );
  }

  return (
    <>
      {flash && <FlashToast kind={flash.kind} message={flash.message} />}
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-[1.75rem]">{greeting(org.timezone)}, {firstName}</h1>
          <p className="mt-1 text-[15px] text-ink-500">Here’s how your quotes are performing.</p>
        </div>
        <ButtonLink href="/quotes/new" size="sm" className="hidden sm:inline-flex"><Plus className="size-4" aria-hidden /> Add quote</ButtonLink>
      </div>

      <section aria-label="Overview" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat value={formatMoney(stats.quoteValue)} label="Quote value" hint="Open quotes" emphasis className="col-span-2 lg:col-span-1" />
        <Stat value={formatMoney(stats.potentialRevenue)} label="Potential revenue" hint="Customers who replied" />
        <Stat value={String(stats.followingUp)} label="Quotes followed up" hint="Being chased now" />
        <Stat value={String(stats.replies)} label="Replies" hint="Last 30 days" />
        <Stat value={String(stats.won)} label="Jobs won" hint={`${formatMoney(stats.wonValue)} · last 30 days`} className="lg:hidden" />
      </section>

      {newQuotes > 0 && (
        <Link href="/quotes?status=NEW" className="mt-4 flex items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-900 hover:bg-sky-100">
          <Sparkles className="size-5 shrink-0" aria-hidden />
          <span className="flex-1 text-[15px]">
            <strong>{newQuotes} quote{newQuotes === 1 ? "" : "s"}</strong> ready to start follow-ups
          </span>
          <ArrowRight className="size-5" aria-hidden />
        </Link>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <section aria-labelledby="attention">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="attention" className="text-xs font-bold uppercase tracking-wider text-ink-500">Needs attention</h2>
              {attention.length > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">{attention.length}</span>}
            </div>
            {attention.length === 0 && upcoming.length === 0 ? (
              <Card>
                <div className="flex items-center gap-3 p-5 text-ink-600">
                  <CheckCircle2 className="size-6 text-brand-600" aria-hidden />
                  <p className="text-[15px]">Nothing needs you right now. We’ll let you know the moment a customer replies.</p>
                </div>
              </Card>
            ) : (
              <ul className="space-y-2">
                {attention.map((q) => (
                  <li key={q.id}>
                    <Link href={`/quotes/${q.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-white p-4 shadow-[var(--shadow-card)] hover:border-amber-300">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink-900">{q.customer.name}</p>
                        <p className="truncate text-sm text-ink-600">{q.description} · <span className="font-semibold tabular">{formatMoney(q.amountPence)}</span></p>
                        <p className="mt-1.5 text-xs font-bold uppercase tracking-wide text-amber-700">
                          {q.status === "REPLIED" ? `Replied · ${q.repliedAt ? timeAgo(q.repliedAt) : ""}` : "No reply after final follow-up"}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
                        {q.status === "REPLIED" ? "View conversation" : "View"}
                      </span>
                    </Link>
                  </li>
                ))}
                {upcoming.map((q) => (
                  <li key={q.id}>
                    <Link href={`/quotes/${q.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-ink-200/70 bg-white p-4 shadow-[var(--shadow-card)] hover:border-ink-300">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink-900">{q.customer.name}</p>
                        <p className="truncate text-sm text-ink-600">{q.description} · <span className="font-semibold tabular">{formatMoney(q.amountPence)}</span></p>
                        <p className="mt-1.5 text-xs font-medium text-ink-500">Follow-up {q.nextFollowUpAt ? describeWhen(q.nextFollowUpAt, org.timezone).toLowerCase() : "soon"}</p>
                      </div>
                      <span className="shrink-0 rounded-xl bg-ink-50 px-3 py-2 text-sm font-semibold text-ink-700">View</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Card>
            <CardHeader
              title="Last 14 days"
              description={`${stats.followUpsSent} follow-ups sent in the last 30 days`}
              action={<Link href="/analytics" className="text-sm font-semibold text-brand-700 hover:text-brand-800">Analytics</Link>}
            />
            <CardBody>
              <ActivityChart data={chart} />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <div className="hidden lg:block">
            <Stat value={String(stats.won)} label="Jobs won" hint={`${formatMoney(stats.wonValue)} · last 30 days`} />
          </div>
          <Card>
            <CardHeader title="Recent activity" />
            <CardBody className="pt-3">
              {activity.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-ink-500"><Activity className="size-4" aria-hidden /> Activity will appear here as follow-ups go out.</p>
              ) : (
                <ul className="space-y-3.5">
                  {activity.map((a) => (
                    <li key={a.id} className="flex gap-3">
                      <span className={`mt-1.5 size-2 shrink-0 rounded-full ${dotFor(a.type)}`} aria-hidden />
                      <div className="min-w-0">
                        {a.quoteId ? (
                          <Link href={`/quotes/${a.quoteId}`} className="text-[15px] text-ink-800 hover:underline">{a.message}</Link>
                        ) : (
                          <p className="text-[15px] text-ink-800">{a.message}</p>
                        )}
                        <p className="text-xs text-ink-400">{timeAgo(a.createdAt)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
          <Link href="/quotes" className="flex items-center justify-between rounded-2xl border border-ink-200/70 bg-white p-4 text-[15px] font-semibold text-ink-800 hover:bg-ink-50">
            <span className="flex items-center gap-2"><FileText className="size-5 text-ink-400" aria-hidden /> All quotes</span>
            <ArrowRight className="size-5 text-ink-400" aria-hidden />
          </Link>
        </div>
      </div>
      <ButtonLink href="/quotes/new" className="fixed bottom-20 right-4 z-30 size-14 rounded-full p-0 shadow-lg sm:hidden" aria-label="Add quote">
        <Plus className="size-6" aria-hidden />
      </ButtonLink>
    </>
  );
}

function dotFor(type: string) {
  if (type === "customer.replied") return "bg-amber-500";
  if (type === "quote.won") return "bg-brand-600";
  if (type === "followup.sent") return "bg-sky-500";
  if (type === "followup.failed" || type === "quote.lost") return "bg-rose-400";
  return "bg-ink-300";
}
