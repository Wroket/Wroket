import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isPublicPath } from "@/lib/publicPaths";

const AUTH_COOKIE = "auth_token";

/**
 * Server-side guard: unauthenticated users without a session cookie are redirected
 * before the app shell renders (reduces flash of protected content; not a substitute
 * for API authorization).
 */
export function middleware(request: NextRequest) {
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
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:ico|png|jpg|jpeg|gif|svg|webp|woff|woff2)$).*)",
  ],
};
