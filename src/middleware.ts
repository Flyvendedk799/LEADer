import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";

// Lightweight auth gate. The middleware only checks for the presence of a
// session cookie (it runs on the edge and can't touch the DB) — full validation
// happens server-side in getCurrentUser(). Unauthenticated page requests are
// redirected to /login; unauthenticated API requests get a 401.
//
// Dev bypass (AUTH_DEV_BYPASS=true, non-prod) skips the gate entirely.

const PUBLIC_PAGES = ["/login", "/register"];
const PUBLIC_API_PREFIXES = ["/api/auth", "/api/health", "/api/cron"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PAGES.includes(pathname)) return true;
  if (PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
  return false;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  const devBypass =
    process.env.NODE_ENV !== "production" && process.env.AUTH_DEV_BYPASS === "true";
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);

  if (hasSession || devBypass) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  if (pathname !== "/") loginUrl.searchParams.set("next", pathname + req.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Run on everything except Next internals and common static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};
