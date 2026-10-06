import type { Metadata } from "next";
import { CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { integrations, appUrl } from "@/lib/env";
import { timeAgo } from "@/lib/schedule";
import { flashFrom } from "@/lib/flash";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FlashToast } from "@/components/ui/toast";
import { GoogleIcon, MicrosoftIcon } from "@/components/auth/oauth-buttons";
import { EmailAccountActions } from "@/components/app/settings-forms";

export const metadata: Metadata = { title: "Email settings" };

const STATUS = {
  CONNECTED: { label: "Connected", tone: "brand" as const },
  EXPIRED: { label: "Needs reconnecting", tone: "danger" as const },
  ERROR: { label: "Error", tone: "danger" as const },
  DISCONNECTED: { label: "Disconnected", tone: "neutral" as const },
};

export default async function EmailSettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const { org, membership } = await requireOrg();
  const accounts = await db.emailAccount.findMany({ where: { organisationId: org.id }, orderBy: { connectedAt: "asc" } });
  const canManage = membership.role !== "MEMBER";
  const google = integrations.googleConfigured();
  const microsoft = integrations.microsoftConfigured();
  const flash = flashFrom(params);

  return (
    <div className="space-y-6">
      {flash && <FlashToast kind={flash.kind} message={flash.message} />}
      <Card>
        <CardHeader title="Connected email" description="QuoteFlow finds quotes in your sent email, sends follow-ups from your address, and spots customer replies." />
        <CardBody>
          {accounts.length === 0 ? (
            <p className="rounded-2xl bg-ink-50 p-4 text-[15px] text-ink-600">No email connected yet. Connect Gmail or Outlook below — it takes about 30 seconds.</p>
          ) : (
            <ul className="space-y-3">
              {accounts.map((a) => (
                <li key={a.id} className="rounded-2xl border border-ink-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink-50">{a.provider === "GMAIL" ? <GoogleIcon /> : <MicrosoftIcon />}</span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink-900">{a.email}</p>
                        <p className="text-sm text-ink-500">
                          {a.provider === "GMAIL" ? "Gmail" : "Outlook"} · {a.lastSyncedAt ? `Checked ${timeAgo(a.lastSyncedAt)}` : "Not checked yet"}
                        </p>
                      </div>
                    </div>
                    <Badge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Badge>
                  </div>
                  {a.status !== "CONNECTED" && (
                    <p className="mt-3 flex gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
                      <AlertTriangle className="size-4 shrink-0" aria-hidden /> We can no longer access this mailbox. Reconnect it so follow-ups keep going out.
                    </p>
                  )}
                  {a.status === "CONNECTED" && a.lastError && <p className="mt-3 text-sm text-amber-800">{a.lastError}</p>}
                  <div className="mt-3">
                    <EmailAccountActions accountId={a.id} provider={a.provider} status={a.status} canManage={canManage} />
                  </div>
                </li>
              ))}
            </ul>
          )}

          {canManage ? (
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <ConnectButton provider="google" configured={google} />
              <ConnectButton provider="microsoft" configured={microsoft} />
            </div>
          ) : (
            <p className="mt-4 text-sm text-ink-500">Only the owner or an admin can connect email accounts.</p>
          )}

          <ul className="mt-5 space-y-2 text-sm text-ink-600">
            <li className="flex gap-2"><CheckCircle2 className="size-4 shrink-0 text-brand-600" aria-hidden /> We only read emails to find quotes and customer replies.</li>
            <li className="flex gap-2"><CheckCircle2 className="size-4 shrink-0 text-brand-600" aria-hidden /> Access tokens are encrypted, and deleted when you disconnect.</li>
            <li className="flex gap-2"><CheckCircle2 className="size-4 shrink-0 text-brand-600" aria-hidden /> Follow-ups always stop as soon as a customer replies.</li>
          </ul>
        </CardBody>
      </Card>

      {(!google || !microsoft) && (
        <Card>
          <CardHeader title="Server setup required" description="For the person who runs this QuoteFlow installation." />
          <CardBody className="space-y-4 text-sm text-ink-700">
            <p className="flex gap-2 rounded-xl bg-sky-50 p-3 text-sky-900">
              <Info className="size-4 shrink-0" aria-hidden />
              {!google && !microsoft ? "Gmail and Outlook connections aren't configured yet." : !google ? "Gmail connection isn't configured yet." : "Outlook connection isn't configured yet."} You can still add quotes manually in the meantime.
            </p>
            {!google && (
              <div>
                <p className="font-semibold text-ink-900">Gmail (Google Cloud)</p>
                <ol className="mt-1 list-decimal space-y-1 pl-5">
                  <li>Create an OAuth client (Web application) in Google Cloud Console and enable the Gmail API.</li>
                  <li>Add the redirect URI <code className="break-all rounded bg-ink-100 px-1">{appUrl("/api/oauth/google/callback")}</code></li>
                  <li>Request the <code>gmail.readonly</code> and <code>gmail.send</code> scopes (these need Google verification for public use).</li>
                  <li>Set <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code>, then restart.</li>
                </ol>
              </div>
            )}
            {!microsoft && (
              <div>
                <p className="font-semibold text-ink-900">Outlook (Microsoft Entra ID)</p>
                <ol className="mt-1 list-decimal space-y-1 pl-5">
                  <li>Register an app supporting “Accounts in any organisational directory and personal Microsoft accounts”.</li>
                  <li>Add the Web redirect URI <code className="break-all rounded bg-ink-100 px-1">{appUrl("/api/oauth/microsoft/callback")}</code></li>
                  <li>Add delegated permissions: <code>Mail.Read</code>, <code>Mail.Send</code>, <code>User.Read</code>, <code>offline_access</code>.</li>
                  <li>Set <code>MICROSOFT_CLIENT_ID</code> and <code>MICROSOFT_CLIENT_SECRET</code>, then restart.</li>
                </ol>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Not connecting your inbox?" />
        <CardBody className="text-[15px] text-ink-600">
          {integrations.inboundConfigured()
            ? "Follow-ups for manually added quotes are sent by QuoteFlow on your behalf. Customer replies come back through QuoteFlow, so follow-ups still stop automatically, and are forwarded into your notifications."
            : "Follow-ups for manually added quotes are sent by QuoteFlow on your behalf, with replies going to your login email. Because we can't see those replies, tap “Customer replied” on the quote when someone gets back to you."}
        </CardBody>
      </Card>
    </div>
  );
}

function ConnectButton({ provider, configured }: { provider: "google" | "microsoft"; configured: boolean }) {
  const label = provider === "google" ? "Connect Gmail" : "Connect Outlook";
  const icon = provider === "google" ? <GoogleIcon /> : <MicrosoftIcon />;
  if (!configured) {
    return (
      <span className="flex min-h-12 cursor-not-allowed items-center justify-center gap-3 rounded-xl border border-dashed border-ink-300 bg-ink-50 px-4 text-[15px] font-semibold text-ink-400" aria-disabled="true" title="Not configured on this server — see setup below">
        {icon} {label} <span className="text-xs font-medium">(setup needed)</span>
      </span>
    );
  }
  return (
    <a href={`/api/oauth/${provider}/start?purpose=mailbox&next=/settings/email`} className="flex min-h-12 items-center justify-center gap-3 rounded-xl border border-ink-200 bg-white px-4 text-[15px] font-semibold text-ink-800 hover:bg-ink-50">
      {icon} {label}
    </a>
  );
}
