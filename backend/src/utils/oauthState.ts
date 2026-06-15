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

const ALLOWED_OAUTH_RETURN_PREFIXES = ["/migrate/notion", "/settings", "/notes"] as const;

/** Relative in-app path only — blocks open redirects. */
export function sanitizeOAuthReturnTo(path: string | undefined): string | undefined {
  if (!path?.trim()) return undefined;
  const p = path.trim();
  if (!p.startsWith("/") || p.startsWith("//") || p.includes("://")) return undefined;
  const ok = ALLOWED_OAUTH_RETURN_PREFIXES.some(
    (prefix) => p === prefix || p.startsWith(`${prefix}?`) || p.startsWith(`${prefix}/`),
  );
  if (!ok) return undefined;
  return p.slice(0, 500);
}

export interface OAuthStatePayload {
  uid: string;
  returnTo?: string;
}

/**
 * Create a signed state token embedding the user's UID and expiration.
 */
export function createOAuthState(uid: string, returnTo?: string): string {
  const safeReturn = sanitizeOAuthReturnTo(returnTo);
  const payload = JSON.stringify({
    uid,
    exp: Date.now() + TOKEN_TTL_MS,
    ...(safeReturn ? { r: safeReturn } : {}),
  });
  const b64 = Buffer.from(payload).toString("base64url");
  return `${b64}.${hmac(b64)}`;
}

/**
 * Validate the state token. Returns payload if valid, null otherwise.
 */
export function consumeOAuthState(token: string): OAuthStatePayload | null {
  const dotIdx = token.indexOf(".");
  if (dotIdx < 0) return null;

  const b64 = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  const expected = hmac(b64);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(b64, "base64url").toString()) as {
      uid?: string;
      exp?: number;
      r?: string;
    };
    if (typeof parsed.uid !== "string" || typeof parsed.exp !== "number") return null;
    if (Date.now() > parsed.exp) return null;
    const returnTo = typeof parsed.r === "string" ? sanitizeOAuthReturnTo(parsed.r) : undefined;
    return { uid: parsed.uid, returnTo };
  } catch {
    return null;
  }
}

const SSO_LOGIN_KIND = "sso_login";

export interface SsoLoginStatePayload {
  redirect?: string;
}

/**
 * Stateless OAuth state for Google SSO login (no uid yet). Same HMAC pattern as Calendar OAuth.
 */
export function createSsoLoginState(postLoginRedirect?: string): string {
  const payload = JSON.stringify({
    kind: SSO_LOGIN_KIND,
    exp: Date.now() + TOKEN_TTL_MS,
    n: crypto.randomBytes(16).toString("hex"),
    ...(postLoginRedirect ? { r: postLoginRedirect } : {}),
  });
  const b64 = Buffer.from(payload).toString("base64url");
  return `${b64}.${hmac(b64)}`;
}

export function consumeSsoLoginState(token: string): SsoLoginStatePayload | null {
  const dotIdx = token.indexOf(".");
  if (dotIdx < 0) return null;
  const b64 = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  const expected = hmac(b64);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(b64, "base64url").toString()) as {
      kind?: string;
      exp?: number;
      r?: string;
    };
    if (parsed.kind !== SSO_LOGIN_KIND || typeof parsed.exp !== "number") return null;
    if (Date.now() > parsed.exp) return null;
    return typeof parsed.r === "string" ? { redirect: parsed.r } : {};
  } catch {
    return null;
  }
}
