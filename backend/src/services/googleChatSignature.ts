/**
 * Verify Google Chat Workspace add-on HTTP requests (OIDC bearer).
 * Classic apps may still send body.token / x-goog-channel-token — see controller.
 *
 * @see https://developers.google.com/workspace/chat/verify-requests-from-chat
 */

import crypto from "crypto";

const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

let cachedCerts: { keys: JsonWebKey[]; fetchedAt: number } | null = null;
const CERTS_TTL_MS = 60 * 60 * 1000;

interface JsonWebKey {
  kid?: string;
  kty?: string;
  n?: string;
  e?: string;
  alg?: string;
}

function b64urlToBuffer(s: string): Buffer {
  const pad = 4 - (s.length % 4 || 4);
  const b64 = (s + "=".repeat(pad)).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64");
}

async function fetchGoogleCerts(): Promise<JsonWebKey[]> {
  if (cachedCerts && Date.now() - cachedCerts.fetchedAt < CERTS_TTL_MS) {
    return cachedCerts.keys;
  }
  const res = await fetch(GOOGLE_CERTS_URL, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) return [];
  const body = (await res.json()) as { keys?: JsonWebKey[] };
  cachedCerts = { keys: body.keys ?? [], fetchedAt: Date.now() };
  return cachedCerts.keys;
}

/** Default HTTP endpoint audience for Chat+ interactions. */
export function getGoogleChatHttpEndpoint(): string {
  return (
    process.env.GOOGLE_CHAT_HTTP_ENDPOINT?.trim() ||
    "https://api.wroket.com/integrations/google-chat/interactions"
  );
}

/** Chat Workspace add-on service account (Connection settings in Chat API console). */
export function getGoogleChatServiceAccountEmail(): string {
  const fromEnv = process.env.GOOGLE_CHAT_SERVICE_ACCOUNT_EMAIL?.trim();
  if (fromEnv) return fromEnv;
  const projectNumber = process.env.GOOGLE_CHAT_PROJECT_NUMBER?.trim();
  if (projectNumber) {
    return `service-${projectNumber}@gcp-sa-gsuiteaddons.iam.gserviceaccount.com`;
  }
  return "";
}

export type GoogleChatOidcFailReason =
  | "missing_bearer"
  | "missing_audience_or_sa_env"
  | "malformed_jwt"
  | "expired"
  | "bad_issuer"
  | "aud_mismatch"
  | "email_mismatch"
  | "no_certs"
  | "bad_signature"
  | "verify_error";

/**
 * Verify Google-signed OIDC ID token for Chat add-on HTTP.
 * Accepts either `Authorization: Bearer …` or a raw JWT (add-on `systemIdToken`).
 * Audience must match the configured interactions URL; email must match the add-on SA.
 */
export async function verifyGoogleChatOidcBearer(
  authHeaderOrToken: string | undefined,
): Promise<boolean> {
  const result = await verifyGoogleChatOidcBearerDetailed(authHeaderOrToken);
  return result.ok;
}

/** Same as {@link verifyGoogleChatOidcBearer} with a non-secret failure reason for logs. */
export async function verifyGoogleChatOidcBearerDetailed(
  authHeaderOrToken: string | undefined,
): Promise<{ ok: true } | { ok: false; reason: GoogleChatOidcFailReason }> {
  const audience = getGoogleChatHttpEndpoint();
  const expectedEmail = getGoogleChatServiceAccountEmail();
  if (!audience || !expectedEmail) return { ok: false, reason: "missing_audience_or_sa_env" };

  let token = (authHeaderOrToken ?? "").trim();
  if (token.toLowerCase().startsWith("bearer ")) {
    token = token.slice("Bearer ".length).trim();
  }
  if (!token) return { ok: false, reason: "missing_bearer" };

  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed_jwt" };
  const [h, p, s] = parts;

  let header: { kid?: string; alg?: string };
  let payload: {
    aud?: string | string[];
    exp?: number;
    iss?: string;
    email?: string;
    email_verified?: boolean | string;
  };
  try {
    header = JSON.parse(b64urlToBuffer(h!).toString("utf8")) as typeof header;
    payload = JSON.parse(b64urlToBuffer(p!).toString("utf8")) as typeof payload;
  } catch {
    return { ok: false, reason: "malformed_jwt" };
  }

  if (payload.exp && payload.exp * 1000 < Date.now() - 60_000) {
    return { ok: false, reason: "expired" };
  }
  if (!payload.iss || !GOOGLE_ISSUERS.has(payload.iss)) {
    return { ok: false, reason: "bad_issuer" };
  }

  const aud = payload.aud;
  const audOk = Array.isArray(aud) ? aud.includes(audience) : aud === audience;
  if (!audOk) {
    console.warn("[google-chat-oidc] aud_mismatch", {
      expected: audience,
      got: Array.isArray(aud) ? aud : aud ?? null,
    });
    return { ok: false, reason: "aud_mismatch" };
  }

  const emailVerified =
    payload.email_verified === true || payload.email_verified === "true";
  if (!emailVerified || payload.email !== expectedEmail) {
    console.warn("[google-chat-oidc] email_mismatch", {
      expected: expectedEmail,
      got: payload.email ?? null,
      emailVerified,
    });
    return { ok: false, reason: "email_mismatch" };
  }

  try {
    const keys = await fetchGoogleCerts();
    const jwk = keys.find((k) => k.kid === header.kid) ?? keys[0];
    if (!jwk?.n || !jwk?.e) {
      if (
        process.env.NODE_ENV !== "production" &&
        process.env.GOOGLE_CHAT_SKIP_VERIFY === "true"
      ) {
        return { ok: true };
      }
      return { ok: false, reason: "no_certs" };
    }
    const keyObject = crypto.createPublicKey({
      key: { kty: "RSA", n: jwk.n, e: jwk.e },
      format: "jwk",
    });
    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(`${h}.${p}`);
    verifier.end();
    if (!verifier.verify(keyObject, b64urlToBuffer(s!))) {
      return { ok: false, reason: "bad_signature" };
    }
    return { ok: true };
  } catch (err) {
    console.warn("[google-chat-oidc] verify failed:", err instanceof Error ? err.message : err);
    return { ok: false, reason: "verify_error" };
  }
}
