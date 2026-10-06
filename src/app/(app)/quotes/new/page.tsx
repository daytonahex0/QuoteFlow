import type { Metadata } from "next";
import Link from "next/link";
import { DateTime } from "luxon";
import { ArrowLeft, Inbox } from "lucide-react";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { entitlementFor } from "@/lib/billing/entitlements";
import { sequenceSummary } from "@/lib/sequence-summary";
import { Card, CardBody } from "@/components/ui/card";
import { NewQuoteForm } from "@/components/app/quote-form";

export const metadata: Metadata = { title: "Add a quote" };

export default async function NewQuotePage() {
  const { org } = await requireOrg();
  const [sequences, accounts] = await Promise.all([
    db.followUpSequence.findMany({ where: { organisationId: org.id }, include: { steps: { orderBy: { position: "asc" } } }, orderBy: { createdAt: "asc" } }),
    db.emailAccount.count({ where: { organisationId: org.id, status: "CONNECTED" } }),
  ]);
  const today = DateTime.now().setZone(org.timezone).toISODate()!;
  return (
    <div className="mx-auto max-w-xl">
      <Link href="/quotes" className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-ink-600 hover:text-ink-900">
        <ArrowLeft className="size-4" aria-hidden /> Quotes
      </Link>
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">Add a quote</h1>
      <p className="mt-1 text-[15px] text-ink-500">Takes about 30 seconds. We’ll handle the follow-ups.</p>
      {!accounts && (
        <div className="mt-4 flex gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          <Inbox className="size-5 shrink-0" aria-hidden />
          <p>
            Tip: <Link href="/settings/email" className="font-semibold underline">connect your email</Link> so follow-ups come from your own address and replies are detected automatically.
          </p>
        </div>
      )}
      <Card className="mt-5">
        <CardBody>
          <NewQuoteForm
            today={today}
            canStart={entitlementFor(org.subscription).active}
            sequences={sequences.map((s) => ({ id: s.id, name: s.name, isDefault: s.isDefault, summary: sequenceSummary(s.steps) }))}
          />
        </CardBody>
      </Card>
    </div>
  );
}
