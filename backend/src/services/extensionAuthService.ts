import crypto from "crypto";

import { createExtensionApiKeyForUser, type CreateApiKeyResult } from "./authService";
import { ValidationError } from "../utils/errors";

/**
 * Chrome extension PKCE authorize / token exchange.
 * Auth codes are HMAC-signed (multi-instance safe); single-use via consumed jti set.
 */

const SECRET = process.env.OAUTH_STATE_SECRET || crypto.randomBytes(32).toString("hex");
const CODE_TTL_MS = 60_000;
const MAX_CONSUMED = 5_000;

const consumedJtis = new Set<string>();

function hmac(data: string): string {
  return crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
}

function sha256Base64Url(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("base64url");
}

/** Allow only https://<id>.chromiumapp.org/… redirect URIs (Chrome identity). */
export function isAllowedExtensionRedirectUri(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.protocol !== "https:") return false;
    if (!u.hostname.endsWith(".chromiumapp.org")) return false;
    return true;
  } catch {
    return false;
  }
}

export interface ExtensionAuthorizeInput {
  uid: string;
  codeChallenge: string;
  redirectUri: string;
  /** Optional label for the browser key. */
  browserName?: string;
}

/**
 * Issue a one-shot authorization code (PKCE S256). Client redirects to redirectUri?code=…
 */
export function createExtensionAuthCode(input: ExtensionAuthorizeInput): string {
  const challenge = input.codeChallenge.trim();
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) {
    throw new ValidationError("code_challenge invalide", "INVALID_CODE_CHALLENGE");
  }
  if (!isAllowedExtensionRedirectUri(input.redirectUri)) {
    throw new ValidationError("redirect_uri non autorisé", "INVALID_REDIRECT_URI");
  }
  const jti = crypto.randomBytes(16).toString("hex");
  const payload = JSON.stringify({
    kind: "ext_auth",
    uid: input.uid,
    ch: challenge,
    ru: input.redirectUri,
    bn: (input.browserName ?? "Chrome").slice(0, 64),
    jti,
    exp: Date.now() + CODE_TTL_MS,
  });
  const b64 = Buffer.from(payload).toString("base64url");
  return `${b64}.${hmac(b64)}`;
}

export interface ExtensionTokenExchangeInput {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

/**
 * Exchange auth code + PKCE verifier for an extension API key (plaintext once).
 */
export function exchangeExtensionAuthCode(input: ExtensionTokenExchangeInput): CreateApiKeyResult {
  const dotIdx = input.code.indexOf(".");
  if (dotIdx < 0) throw new ValidationError("code invalide", "INVALID_AUTH_CODE");
  const b64 = input.code.slice(0, dotIdx);
  const sig = input.code.slice(dotIdx + 1);
  const expected = hmac(b64);
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    throw new ValidationError("code invalide", "INVALID_AUTH_CODE");
  }

  let parsed: {
    kind?: string;
    uid?: string;
    ch?: string;
    ru?: string;
    bn?: string;
    jti?: string;
    exp?: number;
  };
  try {
    parsed = JSON.parse(Buffer.from(b64, "base64url").toString()) as typeof parsed;
  } catch {
    throw new ValidationError("code invalide", "INVALID_AUTH_CODE");
  }

  if (parsed.kind !== "ext_auth" || typeof parsed.uid !== "string" || typeof parsed.ch !== "string") {
    throw new ValidationError("code invalide", "INVALID_AUTH_CODE");
  }
  if (typeof parsed.exp !== "number" || Date.now() > parsed.exp) {
    throw new ValidationError("code expiré", "AUTH_CODE_EXPIRED");
  }
  if (typeof parsed.jti !== "string" || consumedJtis.has(parsed.jti)) {
    throw new ValidationError("code déjà utilisé", "AUTH_CODE_USED");
  }
  if (parsed.ru !== input.redirectUri) {
    throw new ValidationError("redirect_uri mismatch", "INVALID_REDIRECT_URI");
  }
  if (!isAllowedExtensionRedirectUri(input.redirectUri)) {
    throw new ValidationError("redirect_uri non autorisé", "INVALID_REDIRECT_URI");
  }

  const verifier = input.codeVerifier.trim();
  if (verifier.length < 43 || verifier.length > 128) {
    throw new ValidationError("code_verifier invalide", "INVALID_CODE_VERIFIER");
  }
  if (sha256Base64Url(verifier) !== parsed.ch) {
    throw new ValidationError("PKCE verification failed", "PKCE_FAILED");
  }

  consumedJtis.add(parsed.jti);
  if (consumedJtis.size > MAX_CONSUMED) {
    const first = consumedJtis.values().next().value;
    if (first) consumedJtis.delete(first);
  }

  return createExtensionApiKeyForUser(parsed.uid, parsed.bn || "Chrome");
}
