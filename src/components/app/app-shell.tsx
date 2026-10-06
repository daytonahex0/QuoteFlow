import Link from "next/link";
import { Bell, ChevronDown, LogOut, Plus, Settings, CreditCard, UserRound } from "lucide-react";
import { BottomNav, SidebarNav } from "./nav";
import { Logo } from "@/components/ui/logo";
import { ButtonLink } from "@/components/ui/button";
import { logoutAction } from "@/app/actions/auth";

type Props = {
  children: React.ReactNode;
  orgName: string;
  hasLogo: boolean;
  logoVersion: string;
  userName: string;
  userEmail: string;
  unread: number;
  banners?: React.ReactNode;
};

function OrgBadge({ orgName, hasLogo, logoVersion }: { orgName: string; hasLogo: boolean; logoVersion: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      {hasLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/logo?v=${logoVersion}`} alt="" className="size-8 shrink-0 rounded-lg border border-ink-200 object-contain" />
      ) : (
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-700 text-sm font-bold text-white" aria-hidden>
          {orgName.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="truncate text-[15px] font-semibold text-ink-900">{orgName}</span>
    </span>
  );
}

export function AppShell({ children, orgName, hasLogo, logoVersion, userName, userEmail, unread, banners }: Props) {
  return (
    <div className="min-h-dvh bg-ink-50">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">
        Skip to content
      </a>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-ink-200/70 bg-white px-4 py-5 md:flex">
        <Link href="/dashboard" className="px-2" aria-label="QuoteFlow dashboard">
          <Logo />
        </Link>
        <ButtonLink href="/quotes/new" className="mt-6 w-full">
          <Plus className="size-5" aria-hidden /> Add quote
        </ButtonLink>
        <div className="mt-6 flex-1">
          <SidebarNav />
        </div>
        <p className="px-3 text-xs text-ink-400">Need help? support@quoteflow.app</p>
      </aside>

      <div className="md:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-ink-200/70 bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
            <Link href="/settings/business" className="min-w-0" aria-label={`${orgName} business settings`}>
              <OrgBadge orgName={orgName} hasLogo={hasLogo} logoVersion={logoVersion} />
            </Link>
            <div className="flex shrink-0 items-center gap-1">
              <Link
                href="/notifications"
                className="relative grid size-11 place-items-center rounded-xl text-ink-600 hover:bg-ink-100"
                aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
              >
                <Bell className="size-[22px]" aria-hidden />
                {unread > 0 && (
                  <span className="absolute right-1.5 top-1.5 grid min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[11px] font-bold leading-5 text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
              <details className="relative">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-xl px-2 hover:bg-ink-100 [&::-webkit-details-marker]:hidden" aria-label="Account menu">
                  <span className="grid size-8 place-items-center rounded-full bg-ink-200 text-sm font-bold text-ink-700" aria-hidden>
                    {userName.charAt(0).toUpperCase()}
                  </span>
                  <ChevronDown className="hidden size-4 text-ink-500 sm:block" aria-hidden />
                </summary>
                <div className="absolute right-0 top-13 z-50 w-64 rounded-2xl border border-ink-200 bg-white p-2 shadow-[var(--shadow-raised)]">
                  <div className="border-b border-ink-100 px-3 pb-3 pt-2">
                    <p className="truncate font-semibold text-ink-900">{userName}</p>
                    <p className="truncate text-sm text-ink-500">{userEmail}</p>
                  </div>
                  <div className="py-1">
                    <Link href="/settings/account" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-ink-700 hover:bg-ink-50">
                      <UserRound className="size-5 text-ink-400" aria-hidden /> Your account
                    </Link>
                    <Link href="/settings" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-ink-700 hover:bg-ink-50">
                      <Settings className="size-5 text-ink-400" aria-hidden /> Settings
                    </Link>
                    <Link href="/settings/billing" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-ink-700 hover:bg-ink-50">
                      <CreditCard className="size-5 text-ink-400" aria-hidden /> Billing
                    </Link>
                  </div>
                  <form action={logoutAction} className="border-t border-ink-100 pt-1">
                    <button type="submit" className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-[15px] text-ink-700 hover:bg-ink-50">
                      <LogOut className="size-5 text-ink-400" aria-hidden /> Log out
                    </button>
                  </form>
                </div>
              </details>
            </div>
          </div>
        </header>
        {banners}
        <main id="main" className="mx-auto max-w-5xl px-4 pb-28 pt-5 sm:px-6 md:pb-12 md:pt-8">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
