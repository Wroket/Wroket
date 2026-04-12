import crypto from "crypto";

import { authenticator } from "otplib";

import { getStore, scheduleSave } from "../persistence";
import { AppError } from "../utils/errors";

const PENDING_TTL_MS = 5 * 60 * 1000;
const EMAIL_OTP_TTL_MS = 10 * 60 * 1000;
const EMAIL_OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const ISSUER = "Wroket";

/** How the second factor is verified for this pending login */
export type Pending2FAMode = "totp" | "email_only" | "totp_or_email";

export interface PendingTwoFactorRow {
  uid: string;
  expiresAt: number;
  mode: Pending2FAMode;
  /** SHA-256 hex of 6-digit email code */
  emailOtpHash?: string;
  emailOtpExpiresAt?: number;
  lastEmailOtpSentAt?: number;
}

/** In-memory index; persisted via store.pendingTwoFactor */
const pendingByToken = new Map<string, PendingTwoFactorRow>();

function persistPending(): void {
  const obj: Record<string, PendingTwoFactorRow> = {};
  pendingByToken.forEach((v, k) => {
    obj[k] = v;
  });
  const store = getStore();
  store.pendingTwoFactor = obj as Record<string, { uid: string; expiresAt: number }>;
  scheduleSave("pendingTwoFactor");
}

(function hydrate() {
  const raw = getStore().pendingTwoFactor;
  if (!raw || typeof raw !== "object") return;
  const now = Date.now();
  for (const [token, row] of Object.entries(raw)) {
    if (!row || typeof row !== "object") continue;
    const r = row as Partial<PendingTwoFactorRow>;
    if (typeof r.uid !== "string" || typeof r.expiresAt !== "number") continue;
    if (r.expiresAt <= now) continue;
    const mode: Pending2FAMode =
      r.mode === "email_only" || r.mode === "totp_or_email" || r.mode === "totp"
        ? r.mode
        : "totp";
    pendingByToken.set(token, {
      uid: r.uid,
      expiresAt: r.expiresAt,
      mode,
      emailOtpHash: typeof r.emailOtpHash === "string" ? r.emailOtpHash : undefined,
      emailOtpExpiresAt: typeof r.emailOtpExpiresAt === "number" ? r.emailOtpExpiresAt : undefined,
      lastEmailOtpSentAt: typeof r.lastEmailOtpSentAt === "number" ? r.lastEmailOtpSentAt : undefined,
    });
  }
  if (pendingByToken.size > 0) {
    console.log("[2fa] %d jeton(s) pending chargé(s)", pendingByToken.size);
  }
})();

setInterval(() => {
  const now = Date.now();
  let n = 0;
  for (const [t, row] of pendingByToken) {
    if (row.expiresAt <= now) {
      pendingByToken.delete(t);
      n++;
    }
  }
  if (n > 0) persistPending();
}, 60_000).unref();

authenticator.options = { window: 1 };

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function buildKeyUri(email: string, secret: string): string {
  return authenticator.keyuri(email, ISSUER, secret);
}

export function verifyTotpCode(secret: string, token: string): boolean {
  if (!secret || !token) return false;
  try {
    return authenticator.check(token.replace(/\s/g, ""), secret);
  } catch {
    return false;
  }
}

function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function verifyEmailOtpOnRow(row: PendingTwoFactorRow, code: string): boolean {
  const digits = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(digits)) return false;
  if (!row.emailOtpHash || !row.emailOtpExpiresAt || Date.now() > row.emailOtpExpiresAt) {
    return false;
  }
  const h = crypto.createHash("sha256").update(digits).digest("hex");
  return timingSafeEqualHex(h, row.emailOtpHash);
}

/**
 * Create a pending login token after password/Google succeeded but before 2FA.
 */
export function createPendingTwoFactorToken(uid: string, mode: Pending2FAMode): string {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + PENDING_TTL_MS;
  pendingByToken.set(token, { uid, expiresAt, mode });
  persistPending();
  return token;
}

export function getPendingRow(token: string): PendingTwoFactorRow | null {
  if (!token) return null;
  const row = pendingByToken.get(token);
  if (!row) return null;
  if (Date.now() > row.expiresAt) {
    pendingByToken.delete(token);
    persistPending();
    return null;
  }
  return row;
}

export function deletePendingToken(token: string): void {
  if (pendingByToken.delete(token)) persistPending();
}

/**
 * Methods available for this pending login (for UI).
 */
export function getPendingTwoFactorMethods(token: string): ("totp" | "email")[] | null {
  const row = getPendingRow(token);
  if (!row) return null;
  const mode = row.mode ?? "totp";
  if (mode === "email_only") return ["email"];
  if (mode === "totp") return ["totp"];
  return ["totp", "email"];
}

/**
 * Generate a new email OTP for this pending login, store hash, return plaintext code for mailing.
 */
export function prepareEmailOtpForPending(token: string): { code: string; uid: string } {
  const row = getPendingRow(token);
  if (!row) {
    throw new AppError(401, "Session 2FA expirée ou invalide. Reconnectez-vous.");
  }
  if (row.mode !== "email_only" && row.mode !== "totp_or_email") {
    throw new AppError(400, "Code email non disponible pour ce compte");
  }
  const now = Date.now();
  if (row.lastEmailOtpSentAt && now - row.lastEmailOtpSentAt < EMAIL_OTP_RESEND_COOLDOWN_MS) {
    throw new AppError(429, "Attendez une minute avant un nouvel envoi");
  }
  const code = (100000 + Math.floor(Math.random() * 900000)).toString();
  const hash = crypto.createHash("sha256").update(code).digest("hex");
  row.emailOtpHash = hash;
  row.emailOtpExpiresAt = now + EMAIL_OTP_TTL_MS;
  row.lastEmailOtpSentAt = now;
  pendingByToken.set(token, row);
  persistPending();
  return { code, uid: row.uid };
}

export function getPendingUid(token: string): string | null {
  const row = getPendingRow(token);
  return row?.uid ?? null;
}

/** @deprecated use getPendingRow + deletePendingToken */
export function consumePendingTwoFactorToken(token: string): string | null {
  const uid = getPendingUid(token);
  if (!uid) return null;
  pendingByToken.delete(token);
  persistPending();
  return uid;
}
