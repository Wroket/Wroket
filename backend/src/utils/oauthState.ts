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

  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(hmac(b64)))) {
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
