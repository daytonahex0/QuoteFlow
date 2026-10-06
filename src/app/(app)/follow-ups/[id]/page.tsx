import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getEntitlement } from "@/lib/billing/entitlements";
import { SequenceEditor } from "@/components/app/sequence-editor";
import { FlashToast } from "@/components/ui/toast";

export const metadata: Metadata = { title: "Edit follow-ups" };

export default async function SequencePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; welcome?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { org, user } = await requireOrg();
  const [sequence, ent, latest] = await Promise.all([
    db.followUpSequence.findFirst({ where: { id, organisationId: org.id }, include: { steps: { orderBy: { position: "asc" } } } }),
    getEntitlement(org.id),
    db.quote.findFirst({ where: { organisationId: org.id }, orderBy: { createdAt: "desc" }, include: { customer: true } }),
  ]);
  if (!sequence) notFound();
  return (
    <>
      {sp.created && <FlashToast kind="success" message="Sequence created. Edit the messages below." />}
      {sp.welcome && <FlashToast kind="success" message="You're set up! Customise your follow-ups below." />}
      <Link href="/follow-ups" className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-ink-600 hover:text-ink-900">
        <ArrowLeft className="size-4" aria-hidden /> Follow-ups
      </Link>
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-ink-900">Edit follow-ups</h1>
      <p className="mb-6 text-[15px] text-ink-500">Change when each email goes out and what it says. Changes apply to future follow-ups.</p>
      <SequenceEditor
        sequence={{ id: sequence.id, name: sequence.name, isDefault: sequence.isDefault, steps: sequence.steps.map((s) => ({ delayDays: s.delayDays, subject: s.subject, body: s.body })) }}
        maxSteps={ent.limits.stepsPerSequence}
        businessName={org.name}
        senderName={org.senderName || user.name}
        signature={org.signature}
        userEmail={user.email}
        sample={latest ? { customerName: latest.customer.name, amountPence: latest.amountPence, description: latest.description } : { customerName: "James Smith", amountPence: 320000, description: "bathroom renovation" }}
      />
    </>
  );
}
