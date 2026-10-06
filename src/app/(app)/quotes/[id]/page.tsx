import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { ArrowLeft, Ban, CheckCircle2, Clock, Mail, MailCheck, MessageSquareReply, Phone, Send, Trophy, XCircle, AlertTriangle, PauseCircle } from "lucide-react";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { describeWhen, timeAgo } from "@/lib/schedule";
import { renderTemplate } from "@/lib/templates";
import { sequenceSummary } from "@/lib/sequence-summary";
import { replyToAddressFor } from "@/lib/automation/followups";
import { integrations } from "@/lib/env";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { FlashToast } from "@/components/ui/toast";
import { EditQuoteDetails, QuoteActions, SequencePicker } from "@/components/app/quote-actions";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Quote" };

const SOURCE_LABEL = { MANUAL: "Added manually", GMAIL: "Detected in Gmail", OUTLOOK: "Detected in Outlook" } as const;

export default async function QuoteDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const { created } = await searchParams;
  const { org, user } = await requireOrg();
  const quote = await db.quote.findFirst({
    where: { id, organisationId: org.id },
    include: {
      customer: true,
      emailAccount: { select: { email: true, status: true } },
      sequence: { include: { steps: { orderBy: { position: "asc" } } } },
      followUps: { orderBy: { position: "asc" }, include: { step: true } },
      messages: { orderBy: { sentAt: "asc" } },
    },
  });
  if (!quote) notFound();

  const [sequences, connectedAccount] = await Promise.all([
    db.followUpSequence.findMany({ where: { organisationId: org.id }, include: { steps: { orderBy: { position: "asc" } } }, orderBy: { createdAt: "asc" } }),
    db.emailAccount.findFirst({ where: { organisationId: org.id, status: "CONNECTED" }, select: { email: true } }),
  ]);

  const tz = org.timezone;
  const fmtDate = (d: Date) => DateTime.fromJSDate(d, { zone: tz }).toFormat("d LLL yyyy");
  const fmtDateTime = (d: Date) => DateTime.fromJSDate(d, { zone: tz }).toFormat("d LLL, HH:mm");
  const next = quote.followUps.find((f) => f.status === "SCHEDULED");
  const senderName = org.senderName || user.name;
  const ctx = { customerName: quote.customer.name, businessName: org.name, amountPence: quote.amountPence, description: quote.description, senderName, signature: org.signature };
  const sendingFrom = quote.emailAccount?.email ?? connectedAccount?.email ?? `${org.name} via QuoteFlow`;
  const preview = next?.step
    ? {
        from: sendingFrom,
        to: `${quote.customer.name} <${quote.customer.email}>`,
        subject:
          quote.sourceSubject && quote.emailAccount
            ? `Re: ${quote.sourceSubject.replace(/^\s*((re|fwd?|fw)\s*:\s*)+/i, "")}`
            : renderTemplate(next.step.subject, ctx),
        body: renderTemplate(next.step.body, ctx),
      }
    : null;
  const replies = quote.messages.filter((m) => m.direction === "INBOUND");
  const lastReply = replies.at(-1);
  const manualRepliesOnly = !quote.emailAccountId && !connectedAccount && !replyToAddressFor(quote.id);
  const daysSince = Math.max(0, Math.round((Date.now() - quote.sentAt.getTime()) / 86400_000));

  return (
    <div className="mx-auto max-w-4xl">
      {created && <FlashToast kind="success" message={quote.status === "FOLLOWING_UP" ? "Quote saved. Follow-ups are scheduled." : "Quote saved."} />}
      <Link href="/quotes" className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-ink-600 hover:text-ink-900">
        <ArrowLeft className="size-4" aria-hidden /> Quotes
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight text-ink-900 sm:text-[1.75rem]">{quote.customer.name}</h1>
          <p className="text-[15px] text-ink-600">{quote.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={quote.status} />
            <span className="text-sm text-ink-500">Sent {daysSince === 0 ? "today" : `${daysSince} day${daysSince === 1 ? "" : "s"} ago`}</span>
          </div>
        </div>
        <p className="text-3xl font-bold tracking-tight text-ink-900 tabular">{formatMoney(quote.amountPence)}</p>
      </div>

      {quote.status === "REPLIED" && (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
          <p className="flex items-center gap-2 font-semibold text-amber-900">
            <MessageSquareReply className="size-5" aria-hidden />
            {quote.customer.name.split(" ")[0]} replied {quote.repliedAt ? timeAgo(quote.repliedAt) : ""} — follow-ups have stopped.
          </p>
          {lastReply?.bodyText && <blockquote className="mt-3 whitespace-pre-wrap rounded-xl bg-white p-3 text-[15px] text-ink-800">{lastReply.bodyText.slice(0, 600)}</blockquote>}
          <p className="mt-3 text-sm text-amber-900">
            Reply from your inbox, then mark the quote as won or lost.{" "}
            <a href={`mailto:${quote.customer.email}?subject=${encodeURIComponent(`Re: ${quote.sourceSubject ?? quote.description}`)}`} className="font-semibold underline">
              Email {quote.customer.name.split(" ")[0]}
            </a>
          </p>
        </div>
      )}
      {quote.status === "NEW" && (
        <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-[15px] text-sky-900">
          {quote.source === "MANUAL" ? "Follow-ups haven't started for this quote yet." : "We found this quote in your sent email. Check the details, then start follow-ups."}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Follow-up timeline" description={quote.sequence ? `${quote.sequence.name} · ${sequenceSummary(quote.sequence.steps)}` : undefined} />
            <CardBody>
              <ol className="relative space-y-0">
                <TimelineItem icon={Send} tone="ink" title="Quote sent" meta={`${fmtDate(quote.sentAt)} · ${formatMoney(quote.amountPence)}`} />
                {quote.followUps.length === 0 && quote.status === "NEW" && quote.sequence === null && (
                  <TimelineItem icon={Clock} tone="muted" title="Follow-ups not started" meta="Start follow-ups to schedule them." />
                )}
                {quote.followUps.length === 0 && quote.status === "NEW" && quote.sequence && (
                  <TimelineItem icon={Clock} tone="muted" title="Follow-ups not started" meta={sequenceSummary(quote.sequence.steps)} />
                )}
                {quote.followUps.map((f) => {
                  const label = `Day ${f.delayDays}`;
                  if (f.status === "SENT")
                    return <TimelineItem key={f.id} icon={MailCheck} tone="sky" title={`${label} — Email sent`} meta={`${f.sentAt ? fmtDateTime(f.sentAt) : ""}${f.subject ? ` · “${f.subject}”` : ""}`} />;
                  if (f.status === "CANCELLED")
                    return (
                      <TimelineItem key={f.id} icon={Ban} tone="muted" title={`${label} — Cancelled`} meta={quote.status === "REPLIED" ? "Customer replied" : quote.status === "WON" ? "Quote won" : quote.status === "LOST" ? "Quote lost" : "Stopped"} />
                    );
                  if (f.status === "FAILED")
                    return <TimelineItem key={f.id} icon={AlertTriangle} tone="danger" title={`${label} — Couldn’t send`} meta={f.lastError ?? "Sending failed"} />;
                  if (quote.status === "PAUSED")
                    return <TimelineItem key={f.id} icon={PauseCircle} tone="muted" title={`${label} — Paused`} meta="Resume to reschedule" />;
                  return (
                    <TimelineItem
                      key={f.id}
                      icon={Mail}
                      tone="outline"
                      title={`${label} — Email scheduled`}
                      meta={`${describeWhen(f.scheduledFor, tz)}${f.lastError ? ` · ${f.lastError}` : ""}`}
                    />
                  );
                })}
                {replies.length > 0 && quote.repliedAt && (
                  <TimelineItem icon={MessageSquareReply} tone="amber" title="Customer replied" meta={fmtDateTime(quote.repliedAt)} />
                )}
                {quote.status === "REPLIED" && !replies.length && quote.repliedAt && (
                  <TimelineItem icon={MessageSquareReply} tone="amber" title="Marked as replied" meta={fmtDateTime(quote.repliedAt)} />
                )}
                {quote.status === "WON" && <TimelineItem icon={Trophy} tone="brand" title="Job won" meta={quote.wonAt ? fmtDate(quote.wonAt) : ""} last />}
                {quote.status === "LOST" && <TimelineItem icon={XCircle} tone="muted" title="Quote lost" meta={quote.lostAt ? fmtDate(quote.lostAt) : ""} last />}
              </ol>
              {quote.status === "FOLLOWING_UP" && !next && (
                <p className="mt-4 flex items-center gap-2 rounded-xl bg-ink-50 p-3 text-sm text-ink-600">
                  <CheckCircle2 className="size-4 text-brand-600" aria-hidden /> All follow-ups have been sent. A quick phone call might help.
                </p>
              )}
              {manualRepliesOnly && quote.status === "FOLLOWING_UP" && (
                <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                  No inbox is connected, so customer replies go straight to your email and can’t be detected automatically. Tap “Customer replied” when they get in touch.{" "}
                  <Link href="/settings/email" className="font-semibold underline">Connect email</Link>
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Conversation" description={quote.messages.length ? undefined : "Emails linked to this quote will appear here."} />
            <CardBody>
              {quote.messages.length === 0 ? (
                <p className="text-sm text-ink-500">No emails yet.{integrations.resendConfigured() || connectedAccount ? "" : " Follow-ups will show here once sent."}</p>
              ) : (
                <ul className="space-y-3">
                  {quote.messages.map((m) => (
                    <li key={m.id} className={cn("rounded-2xl p-4", m.direction === "INBOUND" ? "border border-amber-200 bg-amber-50/50" : "bg-ink-50")}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                        <span className="font-semibold text-ink-900">
                          {m.direction === "INBOUND" ? m.fromName || m.fromEmail : m.kind === "QUOTE" ? "Your quote" : "Follow-up"}
                        </span>
                        <time className="text-ink-500" dateTime={m.sentAt.toISOString()}>{fmtDateTime(m.sentAt)}</time>
                      </div>
                      <p className="mt-1 text-sm font-medium text-ink-700">{m.subject}</p>
                      {m.bodyText && <p className="mt-2 line-clamp-6 whitespace-pre-wrap text-[15px] leading-relaxed text-ink-700">{m.bodyText}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Actions" />
            <CardBody>
              <QuoteActions quoteId={quote.id} status={quote.status} needsAttention={quote.needsAttention} preview={preview} hasNext={Boolean(next)} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Customer" />
            <CardBody className="space-y-3 pt-3">
              <p className="font-semibold text-ink-900">{quote.customer.name}</p>
              <a href={`mailto:${quote.customer.email}`} className="flex min-h-10 items-center gap-2 break-all text-[15px] text-brand-700 hover:underline">
                <Mail className="size-4 shrink-0" aria-hidden /> {quote.customer.email}
              </a>
              {quote.customer.phone && (
                <a href={`tel:${quote.customer.phone.replace(/\s/g, "")}`} className="flex min-h-10 items-center gap-2 text-[15px] text-brand-700 hover:underline">
                  <Phone className="size-4" aria-hidden /> {quote.customer.phone}
                </a>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Quote" />
            <CardBody className="pt-3">
              <dl className="space-y-3 text-[15px]">
                <Row label="Amount" value={formatMoney(quote.amountPence)} />
                <Row label="Description" value={quote.description} />
                <Row label="Date sent" value={fmtDate(quote.sentAt)} />
                <Row label="Status" value={<StatusBadge status={quote.status} />} />
                <Row label="Source" value={SOURCE_LABEL[quote.source]} />
              </dl>
              <div className="mt-4 space-y-2 border-t border-ink-100 pt-4">
                <p className="text-sm font-medium text-ink-800">Follow-up sequence</p>
                <SequencePicker
                  quoteId={quote.id}
                  current={quote.sequenceId}
                  disabled={!["NEW", "FOLLOWING_UP", "PAUSED"].includes(quote.status)}
                  sequences={sequences.map((s) => ({ id: s.id, name: s.name, summary: sequenceSummary(s.steps) }))}
                />
                {quote.sequenceId && (
                  <Link href={`/follow-ups/${quote.sequenceId}`} className="inline-flex min-h-10 items-center text-sm font-semibold text-brand-700 hover:text-brand-800">
                    Edit sequence
                  </Link>
                )}
              </div>
              <div className="mt-2 border-t border-ink-100 pt-2">
                <EditQuoteDetails
                  quoteId={quote.id}
                  defaults={{
                    customerName: quote.customer.name,
                    customerPhone: quote.customer.phone ?? "",
                    amount: quote.amountPence != null ? (quote.amountPence / 100).toFixed(quote.amountPence % 100 ? 2 : 0) : "",
                    description: quote.description,
                  }}
                />
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-right font-medium text-ink-900">{value}</dd>
    </div>
  );
}

const TONES = {
  ink: "bg-ink-800 text-white",
  sky: "bg-sky-100 text-sky-800",
  outline: "border-2 border-dashed border-ink-300 bg-white text-ink-500",
  muted: "bg-ink-100 text-ink-400",
  amber: "bg-amber-100 text-amber-800",
  brand: "bg-brand-700 text-white",
  danger: "bg-rose-100 text-rose-700",
} as const;

function TimelineItem({ icon: Icon, tone, title, meta, last }: { icon: typeof Mail; tone: keyof typeof TONES; title: string; meta?: string; last?: boolean }) {
  return (
    <li className="group relative flex gap-3 pb-5 last:pb-0">
      {!last && <span className="absolute bottom-0 left-[19px] top-10 w-px bg-ink-200 group-last:hidden" aria-hidden />}
      <span className={cn("relative grid size-10 shrink-0 place-items-center rounded-full", TONES[tone])}>
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <div className="min-w-0 pt-1.5">
        <p className="font-semibold text-ink-900">{title}</p>
        {meta && <p className="text-sm text-ink-500">{meta}</p>}
      </div>
    </li>
  );
}
