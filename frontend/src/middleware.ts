import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isPublicPath } from "@/lib/publicPaths";

const AUTH_COOKIE = "auth_token";
const CANONICAL_HOST = "wroket.com";

/**
 * Hostname from Host header without port (Cloud Run may send `host:port`).
 */
function requestHostname(request: NextRequest): string {
  const raw = request.headers.get("host") ?? request.nextUrl.hostname ?? "";
  return raw.split(":")[0]?.toLowerCase() ?? "";
}

/**
 * Server-side guard: unauthenticated users without a session cookie are redirected
 * before the app shell renders (reduces flash of protected content; not a substitute
 * for API authorization).
 *
 * Also canonicalises `www.wroket.com` → `wroket.com` (301) so Google consolidates
 * indexing on the non-www host instead of reporting www URLs as alternates.
 *
 * Important: do not clone `request.nextUrl` for the www redirect — on Cloud Run it
 * keeps the container listen port (8080), which leaks into Location
 * (`https://wroket.com:8080/`) and breaks Googlebot / Search Console.
 */
export function middleware(request: NextRequest) {
  const host = requestHostname(request);
  const { pathname, search } = request.nextUrl;
  const pathWithSearch = pathname + search;

  if (host === `www.${CANONICAL_HOST}`) {
    return NextResponse.redirect(new URL(pathWithSearch, `https://${CANONICAL_HOST}`), 301);
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (!token) {
    // Prefer public https origin on prod hosts so Cloud Run's :8080 never appears in Location.
    const loginBase =
      host === CANONICAL_HOST || host === `www.${CANONICAL_HOST}`
        ? `https://${host}`
        : request.url;
    const login = new URL("/login", loginBase);
    login.searchParams.set("redirect", pathWithSearch);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  // Include robots.txt / sitemap.xml / static assets so www requests 301 too.
  // Only skip Next.js internal asset paths (immutable hashed bundles).
  matcher: ["/((?!_next/static|_next/image).*)"],
};
