/**
 * Routes that do not require an `auth_token` cookie (keep in sync with `middleware.ts`).
 * Includes `/robots.txt` and `/sitemap.xml` so search engines reach Next's metadata routes
 * instead of being redirected to `/login` (breaks SEO indexing otherwise).
 */
export const PUBLIC_PATHS = [
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/pricing",
  "/privacy",
  "/terms",
  "/agenda-taches",
  "/gestion-taches-equipe",
  "/matrice-eisenhower",
  "/robots.txt",
  "/sitemap.xml",
] as const;

export function isPublicPath(pathname: string): boolean {
  return (PUBLIC_PATHS as readonly string[]).includes(pathname);
}
