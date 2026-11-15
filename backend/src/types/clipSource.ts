/** Provenance for Chrome clipper (and future capture surfaces). */
export interface ClipSource {
  url: string;
  title?: string;
  excerpt?: string;
  via: "chrome_ext";
}

const MAX_EXCERPT = 1000;
const MAX_URL = 2000;
const MAX_TITLE = 500;

export function normalizeClipSource(raw: unknown): ClipSource | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const url = typeof o.url === "string" ? o.url.trim().slice(0, MAX_URL) : "";
  if (!url || !/^https?:\/\//i.test(url)) return undefined;
  const title = typeof o.title === "string" ? o.title.trim().slice(0, MAX_TITLE) : undefined;
  const excerpt =
    typeof o.excerpt === "string" ? o.excerpt.trim().slice(0, MAX_EXCERPT) : undefined;
  return {
    url,
    ...(title ? { title } : {}),
    ...(excerpt ? { excerpt } : {}),
    via: "chrome_ext",
  };
}
