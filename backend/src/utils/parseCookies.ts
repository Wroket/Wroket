/**
 * Safely parse a Cookie header string into a key→value map.
 *
 * Why: authController was using an ad-hoc regex to extract the `tz` cookie
 * value, which skips URI-decoding and is fragile against edge-case cookie
 * formatting (no space after semicolon, duplicate keys, encoded `=` in value).
 * This utility handles all of those correctly.
 */
export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};

  const result: Record<string, string> = {};

  for (const pair of cookieHeader.split(";")) {
    const idx = pair.indexOf("=");
    if (idx < 0) continue;

    const key = pair.slice(0, idx).trim();
    if (!key) continue;

    const raw = pair.slice(idx + 1).trim();
    try {
      result[key] = decodeURIComponent(raw);
    } catch {
      // keep raw value if it is not valid percent-encoding
      result[key] = raw;
    }
  }

  return result;
}
