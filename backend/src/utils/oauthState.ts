import crypto from "crypto";

/**
 * Stateless OAuth state token using HMAC.
 *
 * Works across multiple Cloud Run instances because nothing is stored in memory.
 * The state token is: base64url( JSON({uid, exp}) ) + "." + HMAC_signature
 */

const SECRET = process.env.OAUTH_STATE_SECRET || crypto.randomBytes(32).toString("hex");
const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

function hmac(data: string): string {
  return crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
}

/**
 * Create a signed state token embedding the user's UID and expiration.
 */
export function createOAuthState(uid: string): string {
  const payload = JSON.stringify({ uid, exp: Date.now() + TOKEN_TTL_MS });
  const b64 = Buffer.from(payload).toString("base64url");
  return `${b64}.${hmac(b64)}`;
}

/**
 * Validate the state token. Returns the UID if valid, null otherwise.
 */
export function consumeOAuthState(token: string): string | null {
  const dotIdx = token.indexOf(".");
  if (dotIdx < 0) return null;

  const b64 = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  const expected = hmac(b64);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }

  try {
    const { uid, exp } = JSON.parse(Buffer.from(b64, "base64url").toString());
    if (typeof uid !== "string" || typeof exp !== "number") return null;
    if (Date.now() > exp) return null;
    return uid;
  } catch {
    return null;
  }
}

const SSO_LOGIN_KIND = "sso_login";

/**
 * Stateless OAuth state for Google SSO login (no uid yet). Same HMAC pattern as Calendar OAuth.
 */
export function createSsoLoginState(): string {
  const payload = JSON.stringify({
    kind: SSO_LOGIN_KIND,
    exp: Date.now() + TOKEN_TTL_MS,
    n: crypto.randomBytes(16).toString("hex"),
  });
  const b64 = Buffer.from(payload).toString("base64url");
  return `${b64}.${hmac(b64)}`;
}

export function consumeSsoLoginState(token: string): boolean {
  const dotIdx = token.indexOf(".");
  if (dotIdx < 0) return false;
  const b64 = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  const expected = hmac(b64);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return false;
  }
  try {
    const parsed = JSON.parse(Buffer.from(b64, "base64url").toString()) as { kind?: string; exp?: number };
    if (parsed.kind !== SSO_LOGIN_KIND || typeof parsed.exp !== "number") return false;
    if (Date.now() > parsed.exp) return false;
    return true;
  } catch {
    return false;
  }
}
