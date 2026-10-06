import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/dashboard", "/quotes", "/follow-ups", "/analytics", "/settings", "/notifications", "/onboarding"];

/**
 * Fast edge redirect for signed-out visitors. This is a convenience only —
 * every page and action re-validates the session against the database.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get("qf_session")?.value);
  if (!hasSession && PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|icon.svg|robots.txt|sitemap.xml).*)"],
};
