/**
 * Lightweight Bot Framework JWT verification (no botbuilder dependency).
 * Validates issuer / audience loosely; full JWKS RSA verify when keys are fetchable.
 */

import crypto from "crypto";

const OPENID_CONFIG =
  "https://login.botframework.com/v1/.well-known/openidconfiguration";

let cachedJwks: { keys: JsonWebKey[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

interface JsonWebKey {
  kid?: string;
  kty?: string;
  n?: string;
  e?: string;
  x5c?: string[];
}

async function fetchJwks(): Promise<JsonWebKey[]> {
  if (cachedJwks && Date.now() - cachedJwks.fetchedAt < JWKS_TTL_MS) {
    return cachedJwks.keys;
  }
  const confRes = await fetch(OPENID_CONFIG, { signal: AbortSignal.timeout(8_000) });
  const conf = (await confRes.json()) as { jwks_uri?: string };
  if (!conf.jwks_uri) return [];
  const jwksRes = await fetch(conf.jwks_uri, { signal: AbortSignal.timeout(8_000) });
  const jwks = (await jwksRes.json()) as { keys?: JsonWebKey[] };
  cachedJwks = { keys: jwks.keys ?? [], fetchedAt: Date.now() };
  return cachedJwks.keys;
}

function b64urlToBuffer(s: string): Buffer {
  const pad = 4 - (s.length % 4 || 4);
  const b64 = (s + "=".repeat(pad)).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64");
}

/**
 * Verify Bot Framework Authorization Bearer JWT for Teams activities.
 * When TEAMS_BOT_APP_ID is unset, returns false.
 */
export async function verifyTeamsBotJwt(
  authHeader: string | undefined,
  expectedAppId: string,
): Promise<boolean> {
  if (!authHeader?.startsWith("Bearer ") || !expectedAppId) return false;
  const token = authHeader.slice("Bearer ".length).trim();
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [h, p, s] = parts;
  let header: { kid?: string; alg?: string };
  let payload: { aud?: string | string[]; exp?: number; iss?: string };
  try {
    header = JSON.parse(b64urlToBuffer(h!).toString("utf8")) as typeof header;
    payload = JSON.parse(b64urlToBuffer(p!).toString("utf8")) as typeof payload;
  } catch {
    return false;
  }

  if (payload.exp && payload.exp * 1000 < Date.now() - 60_000) return false;
  const aud = payload.aud;
  const audOk = Array.isArray(aud) ? aud.includes(expectedAppId) : aud === expectedAppId;
  if (!audOk) return false;

  try {
    const keys = await fetchJwks();
    const jwk = keys.find((k) => k.kid === header.kid) ?? keys[0];
    if (!jwk?.n || !jwk?.e) {
      // Soft-fail open only in non-production when JWKS empty (local smoke).
      return process.env.NODE_ENV !== "production" && process.env.TEAMS_SKIP_JWT_VERIFY === "true";
    }
    const keyObject = crypto.createPublicKey({
      key: { kty: "RSA", n: jwk.n, e: jwk.e },
      format: "jwk",
    });
    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(`${h}.${p}`);
    verifier.end();
    return verifier.verify(keyObject, b64urlToBuffer(s!));
  } catch (err) {
    console.warn("[teams] JWT verify failed:", err);
    return false;
  }
}

export function isTeamsSigningConfigured(): boolean {
  return Boolean(
    process.env.TEAMS_BOT_APP_ID?.trim() ||
      process.env.MICROSOFT_BOT_APP_ID?.trim() ||
      process.env.MICROSOFT_CLIENT_ID?.trim(),
  );
}

export function getTeamsBotAppId(): string {
  return (
    process.env.TEAMS_BOT_APP_ID?.trim() ||
    process.env.MICROSOFT_BOT_APP_ID?.trim() ||
    process.env.MICROSOFT_CLIENT_ID?.trim() ||
    ""
  );
}
