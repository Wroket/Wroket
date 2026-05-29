import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isPublicPath } from "@/lib/publicPaths";

const AUTH_COOKIE = "auth_token";
const CANONICAL_HOST = "wroket.com";

/**
 * Server-side guard: unauthenticated users without a session cookie are redirected
 * before the app shell renders (reduces flash of protected content; not a substitute
 * for API authorization).
 *
 * Also canonicalises `www.wroket.com` → `wroket.com` (301) so Google consolidates
 * indexing on the non-www host instead of reporting www URLs as alternates.
 */
export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (host === `www.${CANONICAL_HOST}`) {
    const canonical = request.nextUrl.clone();
    canonical.hostname = CANONICAL_HOST;
    return NextResponse.redirect(canonical, 301);
  }

  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (!token) {
    const login = new URL("/login", request.url);
    login.searchParams.set("redirect", pathname + request.nextUrl.search);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  // Include robots.txt / sitemap.xml / static assets so www requests 301 too.
  // Only skip Next.js internal asset paths (immutable hashed bundles).
  matcher: ["/((?!_next/static|_next/image).*)"],
};
