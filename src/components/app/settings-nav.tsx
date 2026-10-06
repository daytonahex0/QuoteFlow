"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/cn";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";



export function SettingsTabs() {
  const pathname = usePathname();
  if (pathname === "/settings") return null;
  return (
    <>
      <Link href="/settings" className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-ink-600 hover:text-ink-900 md:hidden">
        <ArrowLeft className="size-4" aria-hidden /> Settings
      </Link>
      <nav aria-label="Settings" className="mb-6 hidden md:block">
        <ul className="flex flex-wrap gap-1 border-b border-ink-200">
          {SETTINGS_SECTIONS.map((s) => {
            const active = pathname.startsWith(s.href);
            return (
              <li key={s.href}>
                <Link
                  href={s.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-semibold", active ? "border-brand-700 text-brand-800" : "border-transparent text-ink-500 hover:text-ink-800")}
                >
                  {s.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
