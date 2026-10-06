"use client";

import Link from "next/link";
import { useTransition } from "react";
import { AlertTriangle, MailWarning, Clock } from "lucide-react";
import { resendVerificationAction } from "@/app/actions/auth";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

function Banner({ tone, icon: Icon, children }: { tone: "warning" | "danger" | "info"; icon: typeof Clock; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className={cn(
        "border-b px-4 py-2.5 text-sm sm:px-6",
        tone === "danger" && "border-rose-200 bg-rose-50 text-rose-900",
        tone === "warning" && "border-amber-200 bg-amber-50 text-amber-900",
        tone === "info" && "border-sky-200 bg-sky-50 text-sky-900",
      )}
    >
      <div className="mx-auto flex max-w-5xl items-start gap-2.5">
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}

export function VerifyEmailBanner({ email }: { email: string }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <Banner tone="info" icon={MailWarning}>
      Please confirm your email address ({email}).{" "}
      <button
        className="font-semibold underline underline-offset-2 disabled:opacity-60"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await resendVerificationAction();
            if (r.ok) toast.success(r.message ?? "Sent.");
            else toast.error(r.error);
          })
        }
      >
        {pending ? "Sending…" : "Resend link"}
      </button>
    </Banner>
  );
}

export function SubscriptionBanner({ state, trialDaysLeft, canManage }: { state: string; trialDaysLeft: number | null; canManage: boolean }) {
  const link = canManage ? (
    <Link href="/settings/billing" className="font-semibold underline underline-offset-2">Choose a plan</Link>
  ) : (
    <span>Ask the account owner to choose a plan.</span>
  );
  if (state === "trial_expired")
    return <Banner tone="danger" icon={AlertTriangle}>Your free trial has ended and follow-ups are paused. {link}</Banner>;
  if (state === "inactive")
    return <Banner tone="danger" icon={AlertTriangle}>Your subscription has ended and follow-ups are paused. {link}</Banner>;
  if (state === "past_due")
    return (
      <Banner tone="warning" icon={AlertTriangle}>
        Your last payment failed. Update your card to keep follow-ups running.{" "}
        {canManage && <Link href="/settings/billing" className="font-semibold underline underline-offset-2">Update billing</Link>}
      </Banner>
    );
  if (state === "trialing" && trialDaysLeft != null && trialDaysLeft <= 3)
    return (
      <Banner tone="info" icon={Clock}>
        {trialDaysLeft === 0 ? "Your free trial ends today." : `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left in your free trial.`} {link}
      </Banner>
    );
  return null;
}

export function MailboxBanner({ email }: { email: string }) {
  return (
    <Banner tone="warning" icon={MailWarning}>
      We’ve lost access to {email}, so follow-ups from it are on hold.{" "}
      <Link href="/settings/email" className="font-semibold underline underline-offset-2">Reconnect</Link>
    </Banner>
  );
}
