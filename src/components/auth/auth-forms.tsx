"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { forgotPasswordAction, loginAction, resetPasswordAction, signupAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/errors";

type BusinessType = { value: string; label: string };

function FormError({ state }: { state: ActionResult | null }) {
  if (!state || state.ok || state.fieldErrors) return null;
  return (
    <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      {state.error}
    </div>
  );
}

function fe(state: ActionResult | null, key: string) {
  return state && !state.ok ? state.fieldErrors?.[key] : undefined;
}

function PasswordInput({ label, name, error, autoComplete, hint }: { label: string; name: string; error?: string; autoComplete: string; hint?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input label={label} name={name} type={show ? "text" : "password"} autoComplete={autoComplete} required error={error} hint={hint} maxLength={200} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-1.5 top-[30px] grid size-10 place-items-center rounded-lg text-ink-500 hover:text-ink-800"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError state={state} />
      <input type="hidden" name="next" value={next ?? ""} />
      <Input label="Email" name="email" type="email" autoComplete="email" inputMode="email" required error={fe(state, "email")} />
      <PasswordInput label="Password" name="password" autoComplete="current-password" error={fe(state, "password")} />
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-semibold text-brand-700 hover:text-brand-800">Forgot password?</Link>
      </div>
      <Button type="submit" size="lg" className="w-full" loading={pending}>Log in</Button>
    </form>
  );
}

export function SignupForm({ businessTypes, invite, inviteEmail, inviteOrg }: { businessTypes: BusinessType[]; invite?: string; inviteEmail?: string; inviteOrg?: string }) {
  const [state, action, pending] = useActionState(signupAction, null);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError state={state} />
      {invite && <input type="hidden" name="invite" value={invite} />}
      <Input label="Your name" name="name" autoComplete="name" required error={fe(state, "name")} maxLength={100} />
      {!invite && <Input label="Business name" name="businessName" autoComplete="organization" required error={fe(state, "businessName")} maxLength={120} placeholder="e.g. ABC Plumbing" />}
      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={inviteEmail}
        readOnly={Boolean(inviteEmail)}
        error={fe(state, "email")}
        hint={inviteOrg ? `You're joining ${inviteOrg}.` : undefined}
      />
      <PasswordInput label="Password" name="password" autoComplete="new-password" error={fe(state, "password")} hint="At least 10 characters, with a number or symbol." />
      {!invite && (
        <Select label="Business type" name="businessType" required defaultValue="" error={fe(state, "businessType")}>
          <option value="" disabled>Choose one…</option>
          {businessTypes.map((b) => (
            <option key={b.value} value={b.value}>{b.label}</option>
          ))}
        </Select>
      )}
      <Button type="submit" size="lg" className="w-full" loading={pending}>Create account</Button>
      <p className="text-center text-xs text-ink-500">
        By creating an account you agree to our <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy policy</Link>.
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, null);
  if (state?.ok) {
    return <div role="status" className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-4 text-[15px] text-brand-900">{state.message}</div>;
  }
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError state={state} />
      <Input label="Email" name="email" type="email" autoComplete="email" inputMode="email" required error={fe(state, "email")} />
      <Button type="submit" size="lg" className="w-full" loading={pending}>Send reset link</Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, null);
  const toast = useToast();
  useEffect(() => {
    if (state && !state.ok && !state.fieldErrors) toast.error(state.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError state={state} />
      <input type="hidden" name="token" value={token} />
      <PasswordInput label="New password" name="password" autoComplete="new-password" error={fe(state, "password")} hint="At least 10 characters, with a number or symbol." />
      <PasswordInput label="Confirm new password" name="confirm" autoComplete="new-password" error={fe(state, "confirm")} />
      <Button type="submit" size="lg" className="w-full" loading={pending}>Update password</Button>
    </form>
  );
}
