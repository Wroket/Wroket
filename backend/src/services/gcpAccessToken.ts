/**
 * GCP access token for REST calls to Google APIs (Cloud Vision, …).
 *
 * Production (Cloud Run): token of the attached service account (`wroket-run`),
 * fetched from the metadata server and cached until shortly before expiry.
 * Local dev: `OCR_DEV_ACCESS_TOKEN` (e.g. `gcloud auth print-access-token`).
 */
import { logger } from "../utils/logger";

const METADATA_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
const EXPIRY_MARGIN_MS = 60_000;
const METADATA_TIMEOUT_MS = 3_000;

let cached: { token: string; expiresAt: number } | null = null;

/**
 * Returns a bearer token usable against `*.googleapis.com`.
 * @throws Error when no token source is available.
 */
export async function getGcpAccessToken(): Promise<string> {
  const devToken = process.env.OCR_DEV_ACCESS_TOKEN?.trim();
  if (devToken) return devToken;

  if (cached && cached.expiresAt - EXPIRY_MARGIN_MS > Date.now()) return cached.token;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), METADATA_TIMEOUT_MS);
  try {
    const res = await fetch(METADATA_TOKEN_URL, {
      headers: { "Metadata-Flavor": "Google" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`metadata server HTTP ${res.status}`);
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new Error("metadata server returned no access_token");
    cached = {
      token: body.access_token,
      expiresAt: Date.now() + (body.expires_in ?? 300) * 1000,
    };
    return cached.token;
  } catch (err) {
    logger.error("[gcpAccessToken] token fetch failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw new Error("GCP access token unavailable");
  } finally {
    clearTimeout(timer);
  }
}

/** Test helper: drop the cached token. */
export function __resetGcpAccessTokenCache(): void {
  cached = null;
}
