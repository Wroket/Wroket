import crypto from "crypto";

/**
 * Secure OAuth state token management.
 *
 * WHY: The original code used the user's raw UID as the `state` parameter in
 * the Google Calendar OAuth flow. Since the callback endpoint is
 * unauthenticated, an attacker could forge:
 *
 *   GET /calendar/google/callback?code=ATTACKER_CODE&state=VICTIM_UID
 *
 * This would bind the attacker's Google Calendar tokens to the victim's
 * account, letting the attacker read/write events on the victim's calendar.
 *
 * FIX: Generate a cryptographically random token, store it in an in-memory
 * map alongside the user's UID, and validate it on callback. Tokens expire
 * after 10 minutes and are single-use.
 */

interface PendingOAuth {
  uid: string;
  createdAt: number;
}

const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes
const pendingTokens = new Map<string, PendingOAuth>();

/**
 * Create a random state token and associate it with the user's UID.
 * Returns the token to embed in the OAuth consent URL.
 */
export function createOAuthState(uid: string): string {
  const token = crypto.randomBytes(32).toString("hex");
  pendingTokens.set(token, { uid, createdAt: Date.now() });
  return token;
}

/**
 * Validate and consume the state token. Returns the UID if valid, null if
 * the token is unknown, expired, or already consumed.
 */
export function consumeOAuthState(token: string): string | null {
  const entry = pendingTokens.get(token);
  if (!entry) return null;

  // Always delete — single-use regardless of validity
  pendingTokens.delete(token);

  if (Date.now() - entry.createdAt > TOKEN_TTL_MS) {
    return null;
  }

  return entry.uid;
}

// Periodic cleanup of expired tokens to avoid unbounded growth if users
// start the flow but never complete it.
setInterval(() => {
  const cutoff = Date.now() - TOKEN_TTL_MS;
  for (const [token, entry] of pendingTokens) {
    if (entry.createdAt < cutoff) pendingTokens.delete(token);
  }
}, 5 * 60 * 1000).unref();
