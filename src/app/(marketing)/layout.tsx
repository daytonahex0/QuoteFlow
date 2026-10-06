import { SiteFooter, SiteHeader } from "@/components/marketing/site-header";
import { getSession } from "@/lib/auth/session";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">
        Skip to content
      </a>
      <SiteHeader signedIn={Boolean(session)} />
      <main id="main" className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
