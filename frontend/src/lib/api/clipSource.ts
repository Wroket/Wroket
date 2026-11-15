/** Provenance for Chrome clipper (mirrors backend ClipSource). */
export interface ClipSource {
  url: string;
  title?: string;
  excerpt?: string;
  via: "chrome_ext";
}

export function isClipSource(value: unknown): value is ClipSource {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const o = value as Record<string, unknown>;
  return typeof o.url === "string" && o.url.length > 0 && o.via === "chrome_ext";
}
