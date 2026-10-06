"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Trash2, Upload } from "lucide-react";
import {
  changePasswordAction,
  deleteAccountAction,
  disconnectEmailAccountAction,
  removeLogoAction,
  syncEmailAccountAction,
  updateBusinessAction,
  updateFollowUpSettingsAction,
  updateNotificationSettingsAction,
  updateProfileAction,
} from "@/app/actions/settings";
import { inviteMemberAction, removeMemberAction, revokeInvitationAction } from "@/app/actions/team";
import { cancelSubscriptionAction, choosePlanAction, openBillingPortalAction, resumeSubscriptionAction } from "@/app/actions/billing";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, Toggle } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/errors";

type FormAction = (prev: ActionResult | null, form: FormData) => Promise<ActionResult>;

/** useActionState + toast feedback + refresh, shared by every settings form. */
function useSettingsForm(action: FormAction, opts: { resetOnSuccess?: boolean } = {}) {
  const toast = useToast();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, run, pending] = useActionState<ActionResult | null, FormData>(action, null);
  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(state.message ?? "Saved.");
      if (opts.resetOnSuccess) formRef.current?.reset();
      router.refresh();
    } else toast.error(state.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  const err = (k: string) => (state && !state.ok ? state.fieldErrors?.[k] : undefined);
  return { state, run, pending, err, formRef };
}

function SaveBar({ pending, label = "Save changes" }: { pending: boolean; label?: string }) {
  return (
    <div className="pt-2">
      <Button type="submit" loading={pending} className="w-full sm:w-auto">{label}</Button>
    </div>
  );
}

export function BusinessForm({ org, businessTypes, hasLogo }: { org: { name: string; businessType: string; senderName: string; address: string; website: string; phone: string; signature: string }; businessTypes: { value: string; label: string }[]; hasLogo: boolean }) {
  const { run, pending, err } = useSettingsForm(updateBusinessAction);
  const [fileName, setFileName] = useState<string | null>(null);
  const [removing, startRemove] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <form action={run} className="space-y-4" noValidate>
      <Input label="Business name" name="name" defaultValue={org.name} required maxLength={120} error={err("name")} />
      <Select label="Business type" name="businessType" defaultValue={org.businessType}>
        {businessTypes.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
      </Select>
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-ink-800">Logo</p>
        <div className="flex flex-wrap items-center gap-3">
          {hasLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/logo?t=${Date.now()}`} alt="Current logo" className="size-14 rounded-xl border border-ink-200 object-contain" />
          )}
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 text-[15px] font-semibold text-ink-800 hover:bg-ink-50 focus-within:ring-4 focus-within:ring-brand-100">
            <Upload className="size-4" aria-hidden /> {fileName ?? (hasLogo ? "Replace logo" : "Upload logo")}
            <input type="file" name="logo" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} />
          </label>
          {hasLogo && (
            <Button
              variant="ghost"
              size="sm"
              loading={removing}
              onClick={() =>
                startRemove(async () => {
                  const r = await removeLogoAction();
                  if (r.ok) { toast.success(r.message ?? "Removed."); router.refresh(); } else toast.error(r.error);
                })
              }
            >
              Remove
            </Button>
          )}
        </div>
        {err("logo") ? <p className="text-sm text-rose-600" role="alert">{err("logo")}</p> : <p className="text-sm text-ink-500">PNG, JPG or WebP, up to 512 KB.</p>}
      </div>
      <Input label="Your name on emails" name="senderName" defaultValue={org.senderName} optional maxLength={80} hint="Shown as the sender and used for {{sender_name}}." />
      <Textarea label="Address" name="address" defaultValue={org.address} optional rows={2} maxLength={300} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Website" name="website" defaultValue={org.website} optional inputMode="url" placeholder="www.example.co.uk" error={err("website")} />
        <Input label="Phone" name="phone" type="tel" defaultValue={org.phone} optional error={err("phone")} />
      </div>
      <Textarea
        label="Default signature"
        name="signature"
        defaultValue={org.signature}
        optional
        rows={4}
        maxLength={1000}
        hint="Used for {{signature}} at the end of follow-ups. Leave blank to use your name and business name."
      />
      <SaveBar pending={pending} />
    </form>
  );
}

export function FollowUpSettingsForm({ org, sequences, timezones }: { org: { timezone: string; sendingStartHour: number; sendingEndHour: number; sendOnWeekends: boolean; maxDailyEmails: number; autoFollowUpDetected: boolean }; sequences: { id: string; name: string; isDefault: boolean }[]; timezones: string[] }) {
  const { run, pending, err } = useSettingsForm(updateFollowUpSettingsAction);
  const hours = Array.from({ length: 25 }, (_, h) => h);
  const label = (h: number) => (h === 24 ? "24:00 (midnight)" : `${String(h).padStart(2, "0")}:00`);
  return (
    <form action={run} className="space-y-4" noValidate>
      <Select label="Default sequence" name="defaultSequenceId" defaultValue={sequences.find((s) => s.isDefault)?.id}>
        {sequences.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </Select>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Send from" name="sendingStartHour" defaultValue={String(org.sendingStartHour)}>
          {hours.slice(0, 24).map((h) => <option key={h} value={h}>{label(h)}</option>)}
        </Select>
        <Select label="Send until" name="sendingEndHour" defaultValue={String(org.sendingEndHour)} error={err("sendingEndHour")}>
          {hours.slice(1).map((h) => <option key={h} value={h}>{label(h)}</option>)}
        </Select>
      </div>
      <Select label="Time zone" name="timezone" defaultValue={org.timezone} error={err("timezone")}>
        {timezones.map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>)}
      </Select>
      <Input label="Maximum emails per day" name="maxDailyEmails" type="number" inputMode="numeric" min={1} max={500} defaultValue={String(org.maxDailyEmails)} error={err("maxDailyEmails")} hint="Protects your sender reputation. Extra follow-ups roll over to the next day." />
      <div className="divide-y divide-ink-100 rounded-2xl border border-ink-200 px-4">
        <Toggle name="sendOnWeekends" defaultChecked={org.sendOnWeekends} label="Send at weekends" description="Off by default — most customers reply better on weekdays." />
        <Toggle name="autoFollowUpDetected" defaultChecked={org.autoFollowUpDetected} label="Auto-start follow-ups for detected quotes" description="When we find a new quote in your sent email, start following up straight away." />
      </div>
      <SaveBar pending={pending} />
    </form>
  );
}

export function NotificationSettingsForm({ org }: { org: { notifyReplies: boolean; notifyWon: boolean; notifyFailures: boolean; notifyByEmail: boolean } }) {
  const { run, pending } = useSettingsForm(updateNotificationSettingsAction);
  return (
    <form action={run} className="space-y-4">
      <div className="divide-y divide-ink-100 rounded-2xl border border-ink-200 px-4">
        <Toggle name="notifyReplies" defaultChecked={org.notifyReplies} label="Customer replies" description="When a customer responds to a quote or follow-up." />
        <Toggle name="notifyWon" defaultChecked={org.notifyWon} label="Won quotes" description="When a quote is marked as won." />
        <Toggle name="notifyFailures" defaultChecked={org.notifyFailures} label="Failed automations" description="When a follow-up couldn't be sent." />
      </div>
      <div className="rounded-2xl border border-ink-200 px-4">
        <Toggle name="notifyByEmail" defaultChecked={org.notifyByEmail} label="Also send these by email" description="In-app notifications are always on. Email connection problems and billing issues are always emailed." />
      </div>
      <SaveBar pending={pending} />
    </form>
  );
}

export function EmailAccountActions({ accountId, provider, status, canManage }: { accountId: string; provider: "GMAIL" | "OUTLOOK"; status: string; canManage: boolean }) {
  const [pending, start] = useTransition();
  const [which, setWhich] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();
  const go = (kind: "sync" | "disconnect") => {
    if (kind === "disconnect" && !window.confirm("Disconnect this mailbox? Follow-ups for quotes from it will pause until you reconnect.")) return;
    setWhich(kind);
    start(async () => {
      const r = kind === "sync" ? await syncEmailAccountAction(accountId) : await disconnectEmailAccountAction(accountId);
      setWhich(null);
      if (r.ok) toast.success(r.message ?? "Done.");
      else toast.error(r.error, kind === "sync" ? { label: "Retry", onClick: () => go("sync") } : undefined);
      router.refresh();
    });
  };
  const reconnectHref = `/api/oauth/${provider === "GMAIL" ? "google" : "microsoft"}/start?purpose=mailbox&next=/settings/email`;
  return (
    <div className="flex flex-wrap gap-2">
      {status === "CONNECTED" ? (
        <Button variant="outline" size="sm" onClick={() => go("sync")} loading={pending && which === "sync"} disabled={pending}>
          <RefreshCw className="size-4" aria-hidden /> Check now
        </Button>
      ) : (
        canManage && <a href={reconnectHref} className="inline-flex min-h-9 items-center rounded-xl bg-brand-700 px-3 text-sm font-semibold text-white hover:bg-brand-800">Reconnect</a>
      )}
      {canManage && (
        <Button variant="ghost" size="sm" className="text-rose-700 hover:bg-rose-50" onClick={() => go("disconnect")} loading={pending && which === "disconnect"} disabled={pending}>
          Disconnect
        </Button>
      )}
    </div>
  );
}

export function PlanButton({ plan, label, variant = "primary", disabled }: { plan: "STARTER" | "GROWTH" | "PRO"; label: string; variant?: "primary" | "outline"; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <Button
      variant={variant}
      className="w-full"
      loading={pending}
      disabled={disabled}
      onClick={() =>
        start(async () => {
          const r = await choosePlanAction(plan);
          if (r && !r.ok) toast.error(r.error);
          else if (r?.ok) { toast.success(r.message ?? "Plan updated."); router.refresh(); }
        })
      }
    >
      {label}
    </Button>
  );
}

export function BillingButtons({ hasCustomer, hasSubscription, cancelAtPeriodEnd, isOwner }: { hasCustomer: boolean; hasSubscription: boolean; cancelAtPeriodEnd: boolean; isOwner: boolean }) {
  const [pending, start] = useTransition();
  const [which, setWhich] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();
  const run = (kind: string, fn: () => Promise<ActionResult>) => {
    setWhich(kind);
    start(async () => {
      const r = await fn();
      setWhich(null);
      if (r && !r.ok) toast.error(r.error);
      else if (r?.ok) { toast.success(r.message ?? "Done."); router.refresh(); }
    });
  };
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {hasCustomer && (
        <Button variant="outline" loading={pending && which === "portal"} disabled={pending} onClick={() => run("portal", openBillingPortalAction)}>
          Manage subscription & invoices
        </Button>
      )}
      {hasSubscription && isOwner && !cancelAtPeriodEnd && (
        <Button
          variant="ghost"
          className="text-rose-700 hover:bg-rose-50"
          loading={pending && which === "cancel"}
          disabled={pending}
          onClick={() => window.confirm("Cancel your subscription? Follow-ups keep running until the end of this billing period.") && run("cancel", cancelSubscriptionAction)}
        >
          Cancel subscription
        </Button>
      )}
      {hasSubscription && cancelAtPeriodEnd && (
        <Button loading={pending && which === "resume"} disabled={pending} onClick={() => run("resume", resumeSubscriptionAction)}>
          Keep my subscription
        </Button>
      )}
    </div>
  );
}

export function InviteForm({ disabled }: { disabled: boolean }) {
  const { run, pending, err, formRef } = useSettingsForm(inviteMemberAction, { resetOnSuccess: true });
  return (
    <form ref={formRef} action={run} className="grid gap-3 sm:grid-cols-[1fr_160px_auto] sm:items-end" noValidate>
      <Input label="Email address" name="email" type="email" inputMode="email" required error={err("email")} disabled={disabled} />
      <Select label="Role" name="role" defaultValue="MEMBER" disabled={disabled}>
        <option value="MEMBER">Member</option>
        <option value="ADMIN">Admin</option>
      </Select>
      <Button type="submit" loading={pending} disabled={disabled} className="min-h-12">Send invite</Button>
    </form>
  );
}

export function TeamRowAction({ id, kind }: { id: string; kind: "member" | "invite" }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-rose-700 hover:bg-rose-50"
      loading={pending}
      aria-label={kind === "member" ? "Remove team member" : "Cancel invitation"}
      onClick={() =>
        (kind === "invite" || window.confirm("Remove this person from your team?")) &&
        start(async () => {
          const r = kind === "member" ? await removeMemberAction(id) : await revokeInvitationAction(id);
          if (r.ok) { toast.success(r.message ?? "Done."); router.refresh(); } else toast.error(r.error);
        })
      }
    >
      <Trash2 className="size-4" aria-hidden />
    </Button>
  );
}

export function ProfileForm({ name, email, hasPassword }: { name: string; email: string; hasPassword: boolean }) {
  const { run, pending, err } = useSettingsForm(updateProfileAction);
  const [currentEmail, setCurrentEmail] = useState(email);
  return (
    <form action={run} className="space-y-4" noValidate>
      <Input label="Name" name="name" defaultValue={name} required autoComplete="name" error={err("name")} />
      <Input label="Email" name="email" type="email" defaultValue={email} required autoComplete="email" onChange={(e) => setCurrentEmail(e.target.value)} error={err("email")} />
      {hasPassword && currentEmail.trim().toLowerCase() !== email && (
        <Input label="Current password" name="currentPassword" type="password" autoComplete="current-password" error={err("currentPassword")} hint="Needed to change your email." />
      )}
      <SaveBar pending={pending} />
    </form>
  );
}

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const { run, pending, err, formRef } = useSettingsForm(changePasswordAction, { resetOnSuccess: true });
  return (
    <form ref={formRef} action={run} className="space-y-4" noValidate>
      {hasPassword && <Input label="Current password" name="currentPassword" type="password" autoComplete="current-password" required error={err("currentPassword")} />}
      <Input label="New password" name="newPassword" type="password" autoComplete="new-password" required error={err("newPassword")} hint="At least 10 characters, with a number or symbol." />
      <SaveBar pending={pending} label={hasPassword ? "Change password" : "Set password"} />
    </form>
  );
}

export function DeleteAccountForm({ isOwner, hasPassword }: { isOwner: boolean; hasPassword: boolean }) {
  const [state, run, pending] = useActionState<ActionResult | null, FormData>(deleteAccountAction, null);
  const err = (k: string) => (state && !state.ok ? state.fieldErrors?.[k] : undefined);
  return (
    <form action={run} className="space-y-4" noValidate>
      <p className="text-[15px] text-ink-600">
        {isOwner
          ? "This permanently deletes your account, your business, every quote, customer, message and connected mailbox, and cancels your subscription. This can't be undone."
          : "This permanently deletes your login. The business and its quotes stay with the account owner."}
      </p>
      {state && !state.ok && !state.fieldErrors && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
      {hasPassword && <Input label="Your password" name="password" type="password" autoComplete="current-password" error={err("password")} />}
      <Input label='Type "DELETE" to confirm' name="confirm" autoComplete="off" error={err("confirm")} />
      <Button type="submit" variant="danger" loading={pending}>Delete my account</Button>
    </form>
  );
}
