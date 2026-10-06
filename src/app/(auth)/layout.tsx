import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-ink-50">
      <header className="mx-auto flex h-16 w-full max-w-md items-center px-4">
        <Link href="/" aria-label="QuoteFlow home">
          <Logo />
        </Link>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-12 pt-4">{children}</main>
      <footer className="pb-8 text-center text-xs text-ink-400">
        <Link href="/privacy" className="hover:text-ink-600">Privacy</Link> · <Link href="/terms" className="hover:text-ink-600">Terms</Link>
      </footer>
    </div>
  );
}
