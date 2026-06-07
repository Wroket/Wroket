const DEFAULT_PATH = "/dashboard";

/** Allow only same-app relative paths (prevents open redirects). */
export function safePostLoginRedirect(path: unknown): string {
  if (typeof path !== "string" || !path.trim()) return DEFAULT_PATH;
  const trimmed = path.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return DEFAULT_PATH;
  if (trimmed.includes("://") || trimmed.includes("\\")) return DEFAULT_PATH;
  return trimmed;
}
