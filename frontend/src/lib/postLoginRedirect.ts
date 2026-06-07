const DEFAULT_PATH = "/dashboard";

/** Read `?redirect=` from login URL; only same-origin relative paths. */
export function getPostLoginRedirect(search: string): string {
  const raw = new URLSearchParams(search).get("redirect");
  return safePostLoginRedirect(raw);
}

export function safePostLoginRedirect(path: string | null | undefined): string {
  if (!path?.trim()) return DEFAULT_PATH;
  const trimmed = path.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return DEFAULT_PATH;
  if (trimmed.includes("://") || trimmed.includes("\\")) return DEFAULT_PATH;
  return trimmed;
}
