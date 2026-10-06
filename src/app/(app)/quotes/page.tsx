import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma, QuoteStatus } from "@prisma/client";
import { FileText, Plus, Search, SearchX } from "lucide-react";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { QuoteCard } from "@/components/app/quote-card";
import { PageHeader } from "@/components/app/page-header";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { STATUS_META } from "@/components/ui/badge";
import { FlashToast } from "@/components/ui/toast";
import { AutoSubmitSelect } from "@/components/ui/auto-submit-select";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Quotes" };

const STATUSES = Object.keys(STATUS_META) as QuoteStatus[];
const PAGE_SIZE = 24;

type Params = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function QuotesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const { org } = await requireOrg();
  const q = str(params.q).trim().slice(0, 100);
  const status = STATUSES.includes(str(params.status) as QuoteStatus) ? (str(params.status) as QuoteStatus) : null;
  const range = ["7", "30", "90"].includes(str(params.range)) ? Number(str(params.range)) : null;
  const sort = ["value", "oldest"].includes(str(params.sort)) ? str(params.sort) : "newest";
  const page = Math.max(1, Math.min(1000, Number(str(params.page)) || 1));

  const where: Prisma.QuoteWhereInput = {
    organisationId: org.id,
    ...(status ? { status } : {}),
    ...(range ? { sentAt: { gte: new Date(Date.now() - range * 86400_000) } } : {}),
    ...(q
      ? {
          OR: [
            { description: { contains: q, mode: "insensitive" } },
            { customer: { name: { contains: q, mode: "insensitive" } } },
            { customer: { email: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const orderBy: Prisma.QuoteOrderByWithRelationInput[] =
    sort === "value" ? [{ amountPence: { sort: "desc", nulls: "last" } }] : sort === "oldest" ? [{ sentAt: "asc" }] : [{ sentAt: "desc" }];

  const [quotes, total, counts, everything] = await Promise.all([
    db.quote.findMany({ where, orderBy, include: { customer: { select: { name: true } } }, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }),
    db.quote.count({ where }),
    db.quote.groupBy({ by: ["status"], where: { organisationId: org.id }, _count: true }),
    db.quote.count({ where: { organisationId: org.id } }),
  ]);
  const countFor = (s: QuoteStatus) => counts.find((c) => c.status === s)?._count ?? 0;
  const filtered = Boolean(q || status || range);

  const link = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const merged = { q, status: status ?? "", range: range ? String(range) : "", sort: sort === "newest" ? "" : sort, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    const s = next.toString();
    return s ? `/quotes?${s}` : "/quotes";
  };

  return (
    <>
      {params.status === "quote_deleted" && <FlashToast kind="success" message="Quote deleted." />}
      <PageHeader
        title="Quotes"
        description={`${everything} quote${everything === 1 ? "" : "s"} · ${countFor("FOLLOWING_UP")} being followed up`}
        actions={<ButtonLink href="/quotes/new" className="hidden sm:inline-flex"><Plus className="size-5" aria-hidden /> Add quote</ButtonLink>}
      />

      {everything === 0 ? (
        <Card>
          <EmptyState
            icon={FileText}
            title="No quotes yet"
            description="Your first quote is waiting. Connect your email and QuoteFlow will automatically find quotes that need following up."
          >
            <ButtonLink href="/settings/email">Connect email</ButtonLink>
            <ButtonLink href="/quotes/new" variant="outline">Add a quote manually</ButtonLink>
          </EmptyState>
        </Card>
      ) : (
        <>
          <form role="search" action="/quotes" className="space-y-3">
            {status && <input type="hidden" name="status" value={status} />}
            <div className="flex gap-2">
              <label className="relative flex-1">
                <span className="sr-only">Search quotes</span>
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-400" aria-hidden />
                <input
                  type="search"
                  name="q"
                  defaultValue={q}
                  placeholder="Search customer or job"
                  className="min-h-12 w-full rounded-xl border border-ink-200 bg-white pl-11 pr-3 text-[16px] placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100"
                />
              </label>
              <button type="submit" className={buttonClasses("outline", "md", "min-h-12")}>Search</button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <label className="sr-only" htmlFor="range">Date sent</label>
              <AutoSubmitSelect id="range" name="range" defaultValue={range ? String(range) : ""} className="min-h-11 rounded-xl border border-ink-200 bg-white px-3 text-[15px]">
                <option value="">Any date</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
              </AutoSubmitSelect>
              <label className="sr-only" htmlFor="sort">Sort by</label>
              <AutoSubmitSelect id="sort" name="sort" defaultValue={sort === "newest" ? "" : sort} className="min-h-11 rounded-xl border border-ink-200 bg-white px-3 text-[15px]">
                <option value="">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="value">Highest value</option>
              </AutoSubmitSelect>
            </div>
          </form>

          <nav aria-label="Filter by status" className="-mx-4 mt-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <ul className="flex w-max gap-2 pb-1">
              <li>
                <Link href={link({ status: null, page: null })} className={pill(!status)} aria-current={!status ? "true" : undefined}>
                  All <span className="tabular opacity-70">{everything}</span>
                </Link>
              </li>
              {STATUSES.map((s) => (
                <li key={s}>
                  <Link href={link({ status: s, page: null })} className={pill(status === s)} aria-current={status === s ? "true" : undefined}>
                    {STATUS_META[s].label} <span className="tabular opacity-70">{countFor(s)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {quotes.length === 0 ? (
            <Card className="mt-4">
              <EmptyState icon={SearchX} title="No matching quotes" description="Try a different search or clear the filters.">
                <ButtonLink href="/quotes" variant="outline">Clear filters</ButtonLink>
              </EmptyState>
            </Card>
          ) : (
            <>
              <p className="sr-only" aria-live="polite">{total} quotes found</p>
              <ul className="mt-4 grid gap-3 md:grid-cols-2">
                {quotes.map((quote) => (
                  <li key={quote.id}>
                    <QuoteCard quote={quote} timezone={org.timezone} />
                  </li>
                ))}
              </ul>
              {total > PAGE_SIZE && (
                <nav aria-label="Pagination" className="mt-6 flex items-center justify-between">
                  {page > 1 ? <ButtonLink href={link({ page: String(page - 1) })} variant="outline">Previous</ButtonLink> : <span />}
                  <span className="text-sm text-ink-500">Page {page} of {Math.ceil(total / PAGE_SIZE)}</span>
                  {page * PAGE_SIZE < total ? <ButtonLink href={link({ page: String(page + 1) })} variant="outline">Next</ButtonLink> : <span />}
                </nav>
              )}
              {filtered && <p className="mt-4 text-center text-sm text-ink-500"><Link href="/quotes" className="font-semibold text-brand-700">Clear filters</Link></p>}
            </>
          )}
        </>
      )}
      <ButtonLink href="/quotes/new" className="fixed bottom-20 right-4 z-30 size-14 rounded-full p-0 shadow-lg sm:hidden" aria-label="Add quote">
        <Plus className="size-6" aria-hidden />
      </ButtonLink>
    </>
  );
}

function pill(active: boolean) {
  return cn(
    "inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-semibold",
    active ? "border-brand-700 bg-brand-700 text-white" : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50",
  );
}
