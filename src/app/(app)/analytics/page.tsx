import type { Metadata } from "next";
import Link from "next/link";
import { DateTime } from "luxon";
import { BarChart3, Lock } from "lucide-react";
import { requireOrg } from "@/lib/auth/session";
import { getEntitlement } from "@/lib/billing/entitlements";
import { analyticsFor, formatDuration } from "@/lib/analytics";
import { dailyActivity } from "@/lib/dashboard";
import { formatMoney } from "@/lib/money";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app/page-header";
import { Stat } from "@/components/app/stat";
import { ActivityChart } from "@/components/app/activity-chart";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Analytics" };

const PRESETS = [7, 30, 90] as const;

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { org } = await requireOrg();
  const ent = await getEntitlement(org.id);
  const tz = org.timezone;
  const today = DateTime.now().setZone(tz);

  let days = PRESETS.includes(Number(sp.range) as 7) ? Number(sp.range) : 30;
  let from = today.minus({ days: days - 1 }).startOf("day");
  let to = today.endOf("day");
  let custom = false;
  let notice: string | null = null;

  if (sp.range === "custom" && sp.from && sp.to) {
    if (!ent.limits.customRange) notice = "Custom date ranges are available on Growth and Pro.";
    else {
      const f = DateTime.fromISO(sp.from, { zone: tz });
      const t = DateTime.fromISO(sp.to, { zone: tz });
      if (f.isValid && t.isValid && f <= t) {
        from = f.startOf("day");
        to = t.endOf("day");
        days = Math.round(to.diff(from, "days").days);
        custom = true;
      } else notice = "Choose a valid date range.";
    }
  }
  const maxDays = ent.limits.analyticsDays;
  if (maxDays && days > maxDays) {
    notice = `Your plan shows up to ${maxDays} days of history. Upgrade for longer ranges.`;
    from = today.minus({ days: maxDays - 1 }).startOf("day");
    days = maxDays;
  }

  const [m, totalQuotes] = await Promise.all([analyticsFor(org.id, { from: from.toJSDate(), to: to.toJSDate() }), db.quote.count({ where: { organisationId: org.id } })]);
  const chart = await dailyActivity(org.id, tz, Math.min(Math.max(days, 7), 90), to.toJSDate());

  return (
    <>
      <PageHeader title="Analytics" description={`${from.toFormat("d LLL yyyy")} – ${to.toFormat("d LLL yyyy")}`} />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <Link key={p} href={`/analytics?range=${p}`} aria-current={!custom && days === p ? "true" : undefined} className={pill(!custom && days === p)}>
            {p} days
          </Link>
        ))}
        <details className="group" open={custom || undefined}>
          <summary className={cn(pill(custom), "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
            {ent.limits.customRange ? null : <Lock className="size-3.5" aria-hidden />} Custom
          </summary>
          <form action="/analytics" className="mt-2 flex flex-wrap items-end gap-2 rounded-2xl border border-ink-200 bg-white p-3">
            <input type="hidden" name="range" value="custom" />
            <label className="text-sm text-ink-700">From<input type="date" name="from" defaultValue={from.toISODate()!} max={today.toISODate()!} className="mt-1 block min-h-11 rounded-xl border border-ink-200 px-3" /></label>
            <label className="text-sm text-ink-700">To<input type="date" name="to" defaultValue={to.toISODate()!} max={today.toISODate()!} className="mt-1 block min-h-11 rounded-xl border border-ink-200 px-3" /></label>
            <button className={buttonClasses("primary", "md")} type="submit">Apply</button>
          </form>
        </details>
      </div>
      {notice && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{notice} <Link href="/settings/billing" className="font-semibold underline">See plans</Link></p>}

      {totalQuotes === 0 ? (
        <Card>
          <EmptyState icon={BarChart3} title="No data yet" description="Analytics appear once you’ve added quotes and follow-ups have gone out.">
            <ButtonLink href="/quotes/new">Add a quote</ButtonLink>
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat value={formatMoney(m.revenueRecovered)} label="Revenue recovered" hint="Won after a follow-up" emphasis />
            <Stat value={String(m.quotesSent)} label="Quotes sent" />
            <Stat value={String(m.quotesFollowedUp)} label="Quotes followed up" hint={`${m.followUpsSent} emails sent`} />
            <Stat value={m.replyRate == null ? "—" : `${Math.round(m.replyRate * 100)}%`} label="Follow-up reply rate" />
            <Stat value={String(m.quotesWon)} label="Quotes won" />
            <Stat value={formatMoney(m.quoteValue)} label="Quote value" hint="Quotes sent in range" />
            <Stat value={formatDuration(m.avgResponseHours)} label="Average response time" hint="Quote sent → customer reply" className="col-span-2 lg:col-span-2" />
          </div>
          <Card className="mt-6">
            <CardHeader title="Daily activity" description={chart.length < days ? `Last ${chart.length} days of the range` : undefined} />
            <CardBody>
              <ActivityChart data={chart} />
            </CardBody>
          </Card>
          {ent.limits.csvExport && (
            <p className="mt-4 text-right">
              <a href={`/api/reports/quotes?from=${from.toISODate()}&to=${to.toISODate()}`} className="text-sm font-semibold text-brand-700 hover:text-brand-800">
                Download quotes report (CSV)
              </a>
            </p>
          )}
        </>
      )}
    </>
  );
}

function pill(active: boolean) {
  return cn(
    "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold",
    active ? "border-brand-700 bg-brand-700 text-white" : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50",
  );
}
