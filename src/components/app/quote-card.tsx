import Link from "next/link";
import type { QuoteStatus } from "@prisma/client";
import { ChevronRight, CalendarClock, MessageSquareReply } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { describeWhen, timeAgo } from "@/lib/schedule";

export type QuoteCardData = {
  id: string;
  description: string;
  amountPence: number | null;
  status: QuoteStatus;
  sentAt: Date;
  nextFollowUpAt: Date | null;
  repliedAt: Date | null;
  needsAttention: boolean;
  overdueNotifiedAt?: Date | null;
  customer: { name: string };
};

export function QuoteCard({ quote, timezone }: { quote: QuoteCardData; timezone: string }) {
  const subline =
    quote.status === "REPLIED" && quote.repliedAt ? (
      <span className="inline-flex items-center gap-1.5 font-medium text-amber-800">
        <MessageSquareReply className="size-4" aria-hidden /> Replied {timeAgo(quote.repliedAt)}
      </span>
    ) : quote.status === "FOLLOWING_UP" && quote.nextFollowUpAt ? (
      <span className="inline-flex items-center gap-1.5 text-ink-600">
        <CalendarClock className="size-4" aria-hidden /> Next follow-up: {describeWhen(quote.nextFollowUpAt, timezone)}
      </span>
    ) : quote.status === "FOLLOWING_UP" ? (
      <span className="text-ink-500">{quote.overdueNotifiedAt ? "No reply after final follow-up" : "All follow-ups sent"}</span>
    ) : quote.status === "NEW" ? (
      <span className="font-medium text-ink-700">Ready to start follow-ups</span>
    ) : null;

  return (
    <Link
      href={`/quotes/${quote.id}`}
      className="group block rounded-[var(--radius-card)] border border-ink-200/70 bg-white p-4 shadow-[var(--shadow-card)] transition-colors hover:border-ink-300 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[17px] font-semibold text-ink-900">{quote.customer.name}</p>
          <p className="truncate text-[15px] text-ink-600">{quote.description}</p>
        </div>
        <p className="shrink-0 text-[17px] font-bold text-ink-900 tabular">{formatMoney(quote.amountPence)}</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <StatusBadge status={quote.status} />
        <span className="text-ink-500">Sent {timeAgo(quote.sentAt)}</span>
      </div>
      {subline && <p className="mt-2 text-sm">{subline}</p>}
      <span className="mt-3 flex items-center justify-end gap-1 text-sm font-semibold text-brand-700 group-hover:text-brand-800">
        View <ChevronRight className="size-4" aria-hidden />
      </span>
    </Link>
  );
}
