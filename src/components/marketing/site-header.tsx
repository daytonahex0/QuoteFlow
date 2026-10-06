import Link from "next/link";
import { Menu } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { ButtonLink } from "@/components/ui/button";

const links = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/#how-it-works", label: "How it works" },
];

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-200/60 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="QuoteFlow home">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-8 md:flex" aria-label="Main">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-[15px] font-medium text-ink-600 hover:text-ink-900">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          {signedIn ? (
            <ButtonLink href="/dashboard" size="sm">Open dashboard</ButtonLink>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost" size="sm">Log in</ButtonLink>
              <ButtonLink href="/signup" size="sm">Start free</ButtonLink>
            </>
          )}
        </div>
        <details className="group relative md:hidden">
          <summary className="grid size-11 cursor-pointer list-none place-items-center rounded-xl text-ink-700 hover:bg-ink-100 [&::-webkit-details-marker]:hidden" aria-label="Open menu">
            <Menu className="size-6" />
          </summary>
          <div className="absolute right-0 top-14 w-64 rounded-2xl border border-ink-200 bg-white p-2 shadow-[var(--shadow-raised)]">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="flex min-h-12 items-center rounded-xl px-3 font-medium text-ink-800 hover:bg-ink-50">
                {l.label}
              </Link>
            ))}
            <div className="mt-2 grid gap-2 border-t border-ink-100 p-1 pt-3">
              {signedIn ? (
                <ButtonLink href="/dashboard">Open dashboard</ButtonLink>
              ) : (
                <>
                  <ButtonLink href="/signup">Start free</ButtonLink>
                  <ButtonLink href="/login" variant="outline">Log in</ButtonLink>
                </>
              )}
            </div>
          </div>
        </details>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-ink-200/70 bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-ink-500">Automatic quote follow-ups for trades and service businesses. Made in the UK.</p>
        </div>
        <nav aria-label="Product" className="grid content-start gap-2 text-sm">
          <p className="font-semibold text-ink-900">Product</p>
          <Link className="text-ink-600 hover:text-ink-900" href="/features">Features</Link>
          <Link className="text-ink-600 hover:text-ink-900" href="/pricing">Pricing</Link>
          <Link className="text-ink-600 hover:text-ink-900" href="/signup">Start free trial</Link>
        </nav>
        <nav aria-label="Legal" className="grid content-start gap-2 text-sm">
          <p className="font-semibold text-ink-900">Legal</p>
          <Link className="text-ink-600 hover:text-ink-900" href="/privacy">Privacy policy</Link>
          <Link className="text-ink-600 hover:text-ink-900" href="/terms">Terms of service</Link>
        </nav>
      </div>
      <div className="border-t border-ink-100 py-6 text-center text-xs text-ink-400">© {new Date().getFullYear()} QuoteFlow. All rights reserved.</div>
    </footer>
  );
}
