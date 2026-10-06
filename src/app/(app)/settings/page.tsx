import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SETTINGS_SECTIONS } from "@/components/app/settings-nav";
import { PageHeader } from "@/components/app/page-header";
import { logoutAction } from "@/app/actions/auth";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsIndex() {
  return (
    <>
      <PageHeader title="Settings" />
      <ul className="divide-y divide-ink-100 overflow-hidden rounded-[var(--radius-card)] border border-ink-200/70 bg-white shadow-[var(--shadow-card)]">
        {SETTINGS_SECTIONS.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className="flex min-h-16 items-center gap-3 px-5 py-3 hover:bg-ink-50">
              <span className="flex-1">
                <span className="block font-semibold text-ink-900">{s.label}</span>
                <span className="block text-sm text-ink-500">{s.description}</span>
              </span>
              <ChevronRight className="size-5 text-ink-300" aria-hidden />
            </Link>
          </li>
        ))}
        <li>
          <Link href="/analytics" className="flex min-h-16 items-center gap-3 px-5 py-3 hover:bg-ink-50 md:hidden">
            <span className="flex-1">
              <span className="block font-semibold text-ink-900">Analytics</span>
              <span className="block text-sm text-ink-500">Reply rates, wins and revenue recovered</span>
            </span>
            <ChevronRight className="size-5 text-ink-300" aria-hidden />
          </Link>
        </li>
      </ul>
      <form action={logoutAction} className="mt-6 md:hidden">
        <button type="submit" className="min-h-12 w-full rounded-xl border border-ink-200 bg-white font-semibold text-ink-700">Log out</button>
      </form>
    </>
  );
}
