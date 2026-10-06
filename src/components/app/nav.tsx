"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, FileText, LayoutDashboard, Repeat, Settings } from "lucide-react";
import { cn } from "@/lib/cn";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, mobile: true },
  { href: "/quotes", label: "Quotes", icon: FileText, mobile: true },
  { href: "/follow-ups", label: "Follow-ups", icon: Repeat, mobile: true },
  { href: "/analytics", label: "Analytics", icon: BarChart3, mobile: false },
  { href: "/settings", label: "Settings", icon: Settings, mobile: true },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="grid gap-1">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors",
              active ? "bg-brand-50 text-brand-800" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
            )}
          >
            <item.icon className="size-5" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-white/95 backdrop-blur md:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {items
          .filter((i) => i.mobile)
          .map((item) => {
            const active = isActive(pathname, item.href) || (item.href === "/dashboard" && pathname.startsWith("/analytics"));
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold", active ? "text-brand-700" : "text-ink-500")}
                >
                  <span className={cn("grid h-8 w-14 place-items-center rounded-full transition-colors", active && "bg-brand-50")}>
                    <item.icon className="size-[22px]" aria-hidden />
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
      </ul>
    </nav>
  );
}
