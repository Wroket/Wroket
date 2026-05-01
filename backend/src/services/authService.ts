import crypto from "crypto";

import { getStore, scheduleSave, flushNow } from "../persistence";
import {
  buildKeyUri,
  createPendingTwoFactorToken,
  deletePendingToken,
  generateTotpSecret,
  getPendingRow,
  verifyEmailOtpOnRow,
  verifyTotpCode,
} from "./twoFactorService";
import { assertValidEmailFormat } from "../utils/emailValidation";
import { AppError, NotFoundError, ValidationError } from "../utils/errors";
import { sendEmailOtpEmail } from "./emailService";
import { validateWebhookUrl } from "./webhookService";
export type EffortMinutes = { light: number; medium: number; heavy: number };

const DEFAULT_EFFORT_MINUTES: EffortMinutes = { light: 10, medium: 30, heavy: 60 };

export interface WorkingHours {
  start: string;   // "09:00" format HH:mm
  end: string;     // "17:00"
  timezone: string; // e.g. "Europe/Paris"
  daysOfWeek: number[]; // 0=Sun, 1=Mon ... 6=Sat
}

export const DEFAULT_WORKING_HOURS: WorkingHours = {
  start: "09:00",
  end: "17:00",
  timezone: "Europe/Paris",
  daysOfWeek: [1, 2, 3, 4, 5],
};

function isValidTimezone(tz: string): boolean {
  try { Intl.DateTimeFormat(undefined, { timeZone: tz }); return true; }
  catch { return false; }
}

export interface GoogleCalendarTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

export interface GoogleCalendarEntry {
  calendarId: string;
  label: string;
  color: string;
  enabled: boolean;
  defaultForBooking?: boolean;
  canWriteBooking?: boolean;
  primary?: boolean;
}

/** A connected Google account with its OAuth tokens and selected calendars */
export interface GoogleAccount {
  id: string;
  email: string;
  tokens: GoogleCalendarTokens;
  calendars: GoogleCalendarEntry[];
}

/** Public version exposed to frontend (no tokens) */
export interface GoogleAccountPublic {
  id: string;
  email: string;
  calendars: GoogleCalendarEntry[];
}

/** Where to send copies of in-app notifications (Paramètres → Intégrations). */
export type NotificationDeliveryMode = "none" | "email" | "slack" | "teams" | "google_chat";

/** How often to flush outbound notifications (email / Slack / Teams / Google Chat). */
export type NotificationOutboundFrequency = "immediate" | "hourly_digest" | "daily_digest";

export interface AuthUser {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  effortMinutes: EffortMinutes;
  workingHours: WorkingHours;
  skipNonWorkingDays: boolean;
  googleCalendarConnected: boolean;
  googleAccounts: GoogleAccountPublic[];
  emailVerified: boolean;
  /** True when TOTP and/or email OTP 2FA is active */
  twoFactorEnabled: boolean;
  /** Primary 2FA is email codes (no authenticator) */
  emailOtp2faEnabled?: boolean;
  /** If true (default), TOTP users can request an email code at login when they lose their phone */
  totpEmailFallbackEnabled?: boolean;
  notificationDeliveryMode: NotificationDeliveryMode;
  /** Required when mode is slack, teams, or google_chat */
  notificationDeliveryWebhookUrl: string | null;
  /** Notification types suppressed entirely (neither in-app nor outbound). */
  notificationTypesDisabledInApp: string[];
  /** Notification types suppressed from outbound only (in-app still shown). */
  notificationTypesDisabledOutbound: string[];
  /** How often outbound notifications are sent. Default: "immediate". */
  notificationOutboundFrequency: NotificationOutboundFrequency;
  /** Local hour (0-23) at which the daily digest is sent. Uses workingHours.timezone. */
  notificationDigestHour: number;
  /**
   * Days before archived tasks (completed / cancelled / deleted) are permanently removed.
   * 0 = never auto-delete. Default when unset: 30.
   */
  archivedTaskRetentionDays: number;
}

interface StoredUser {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  passwordSaltB64: string;
  passwordHashB64: string;
  effortMinutes?: EffortMinutes;
  workingHours?: WorkingHours;
  /** @deprecated migrated to googleAccounts */
  googleCalendarTokens?: GoogleCalendarTokens;
  /** @deprecated migrated to googleAccounts */
  googleCalendars?: GoogleCalendarEntry[];
  googleAccounts?: GoogleAccount[];
  skipNonWorkingDays?: boolean;
  emailVerified?: boolean;
  emailVerifyToken?: string;
  emailVerifyExpiresAt?: number;
  resetToken?: string;
  resetTokenExpiresAt?: number;
  createdAt: string;
  totpEnabled?: boolean;
  /** Base32 secret (stored after setup) */
  totpSecretB64?: string;
  /** Pending secret until user confirms first code */
  totpPendingSecretB64?: string;
  /**
   * True if the user chose this password (register / reset / change).
   * False for Google-only accounts that got a random placeholder hash at signup.
   */
  passwordUserChosen?: boolean;
  /** Email-based 2FA (no authenticator app) */
  emailOtp2faEnabled?: boolean;
  /** When false, TOTP users cannot use email OTP at login (default true = allow fallback) */
  totpEmailFallbackEnabled?: boolean;
  notificationDeliveryMode?: NotificationDeliveryMode;
  notificationDeliveryWebhookUrl?: string;
  notificationTypesDisabledInApp?: string[];
  notificationTypesDisabledOutbound?: string[];
  notificationOutboundFrequency?: NotificationOutboundFrequency;
  notificationDigestHour?: number;
  /** 0 = never purge archived tasks; 1–365 = days until permanent removal (default applied when unset). */
  archivedTaskRetentionDays?: number;
  /** Pending enrollment / disable flows — email OTP verification */
  email2faEnrollHash?: string;
  email2faEnrollExpiresAt?: number;
  email2faDisableHash?: string;
  email2faDisableExpiresAt?: number;
}

interface StoredSession {
  uid: string;
  expiresAt: number;
  createdAt: number;
}

const usersByUid = new Map<string, StoredUser>();
const sessionsByToken = new Map<string, StoredSession>();

function persistUsers(): void {
  const obj: Record<string, StoredUser> = {};
  usersByUid.forEach((v, k) => { obj[k] = v; });
  const store = getStore();
  store.users = obj;
  scheduleSave("users");
}

function persistSessions(): void {
  const obj: Record<string, StoredSession> = {};
  sessionsByToken.forEach((v, k) => { obj[k] = v; });
  const store = getStore();
  store.sessions = obj;
  scheduleSave("sessions");
}

(function hydrate() {
  const store = getStore();

  if (store.users) {
    for (const [k, v] of Object.entries(store.users)) {
      usersByUid.set(k, v as StoredUser);
    }
    console.log("[auth] %d utilisateur(s) chargé(s) depuis le fichier local", usersByUid.size);
  }

  if (store.sessions) {
    const now = Date.now();
    for (const [token, session] of Object.entries(store.sessions)) {
      const s = session as StoredSession;
      if (now <= s.expiresAt) {
        sessionsByToken.set(token, s);
      }
    }
    console.log("[auth] %d session(s) chargée(s) depuis le fichier local", sessionsByToken.size);
  }
})();

setInterval(() => {
  let cleaned = 0;
  const now = Date.now();
  for (const [token, session] of sessionsByToken) {
    if (now > session.expiresAt) {
      sessionsByToken.delete(token);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    persistSessions();
    console.log("[auth] %d session(s) expirée(s) nettoyée(s)", cleaned);
  }
}, 5 * 60 * 1000).unref();

/** Migrate legacy single-account format to googleAccounts[] */
function migrateGoogleAccounts(user: StoredUser): void {
  if (user.googleCalendarTokens && !user.googleAccounts?.length) {
    user.googleAccounts = [{
      id: crypto.randomUUID(),
      email: "Google Calendar",
      tokens: user.googleCalendarTokens,
      calendars: user.googleCalendars ?? [],
    }];
    delete user.googleCalendarTokens;
    delete user.googleCalendars;
    persistUsers();
  }
}

function resolveGoogleAccounts(user: StoredUser): GoogleAccount[] {
  migrateGoogleAccounts(user);
  return user.googleAccounts ?? [];
}

function readNotificationDeliveryMode(user: StoredUser): NotificationDeliveryMode {
  const m = user.notificationDeliveryMode;
  if (m === "none" || m === "email" || m === "slack" || m === "teams" || m === "google_chat") return m;
  return "none";
}

function readNotificationOutboundFrequency(user: StoredUser): NotificationOutboundFrequency {
  const f = user.notificationOutboundFrequency;
  if (f === "immediate" || f === "hourly_digest" || f === "daily_digest") return f;
  return "immediate";
}

const DEFAULT_ARCHIVED_TASK_RETENTION_DAYS = 90;

function readArchivedTaskRetentionDays(user: StoredUser): number {
  const d = user.archivedTaskRetentionDays;
  if (d === 0) return 0;
  if (typeof d === "number" && Number.isFinite(d)) {
    const n = Math.floor(d);
    if (n === 0) return 0;
    if (n >= 1 && n <= 365) return n;
  }
  return DEFAULT_ARCHIVED_TASK_RETENTION_DAYS;
}

/** Retention for purge jobs: same rules as {@link readArchivedTaskRetentionDays}. */
export function getArchivedTaskRetentionDaysForPurge(uid: string): number {
  const u = usersByUid.get(uid);
  return u ? readArchivedTaskRetentionDays(u) : DEFAULT_ARCHIVED_TASK_RETENTION_DAYS;
}

function toAuthUser(user: StoredUser): AuthUser {
  const accounts = resolveGoogleAccounts(user);
  return {
    uid: user.uid,
    email: user.email,
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    effortMinutes: user.effortMinutes ?? DEFAULT_EFFORT_MINUTES,
    workingHours: user.workingHours ?? DEFAULT_WORKING_HOURS,
    skipNonWorkingDays: user.skipNonWorkingDays ?? false,
    googleCalendarConnected: accounts.length > 0,
    googleAccounts: accounts.map((a) => ({ id: a.id, email: a.email, calendars: a.calendars })),
    emailVerified: user.emailVerified ?? false,
    twoFactorEnabled: !!(
      (user.totpEnabled && user.totpSecretB64) || user.emailOtp2faEnabled
    ),
    emailOtp2faEnabled: !!user.emailOtp2faEnabled,
    totpEmailFallbackEnabled: user.totpEmailFallbackEnabled !== false,
    notificationDeliveryMode: readNotificationDeliveryMode(user),
    notificationDeliveryWebhookUrl: user.notificationDeliveryWebhookUrl?.trim() || null,
    notificationTypesDisabledInApp: Array.isArray(user.notificationTypesDisabledInApp) ? user.notificationTypesDisabledInApp : [],
    notificationTypesDisabledOutbound: Array.isArray(user.notificationTypesDisabledOutbound) ? user.notificationTypesDisabledOutbound : [],
    notificationOutboundFrequency: readNotificationOutboundFrequency(user),
    notificationDigestHour: typeof user.notificationDigestHour === "number" ? Math.max(0, Math.min(23, Math.floor(user.notificationDigestHour))) : 8,
    archivedTaskRetentionDays: readArchivedTaskRetentionDays(user),
  };
}

const COOKIE_NAME = "auth_token";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

export type LoginSuccess = AuthUser & { sessionToken: string };
export type TwoFactorMethod = "totp" | "email";

export type LoginNeedsTotp = {
  requiresTwoFactor: true;
  pendingToken: string;
  twoFactorMethods: TwoFactorMethod[];
};
export type LoginResult = LoginSuccess | LoginNeedsTotp;

function twoFactorMethodsForPendingUser(user: StoredUser): TwoFactorMethod[] {
  if (user.emailOtp2faEnabled && !user.totpSecretB64) {
    return ["email"];
  }
  if (user.totpEnabled && user.totpSecretB64) {
    const methods: TwoFactorMethod[] = ["totp"];
    if (user.totpEmailFallbackEnabled !== false && user.emailVerified) {
      methods.push("email");
    }
    return methods;
  }
  return ["totp"];
}

function needsSecondFactorAfterPrimaryAuth(user: StoredUser): boolean {
  return !!(
    (user.totpEnabled && user.totpSecretB64) || user.emailOtp2faEnabled
  );
}

function createPendingTokenForUser(user: StoredUser): string {
  if (user.emailOtp2faEnabled && !user.totpSecretB64) {
    return createPendingTwoFactorToken(user.uid, "email_only");
  }
  if (user.totpEnabled && user.totpSecretB64) {
    const allowEmail =
      user.totpEmailFallbackEnabled !== false && user.emailVerified;
    return createPendingTwoFactorToken(
      user.uid,
      allowEmail ? "totp_or_email" : "totp",
    );
  }
  return createPendingTwoFactorToken(user.uid, "totp");
}

function issueSessionToken(uid: string): LoginSuccess {
  const user = usersByUid.get(uid);
  if (!user) throw new NotFoundError("Utilisateur introuvable");
  for (const [tok, sess] of sessionsByToken) {
    if (sess.uid === uid) sessionsByToken.delete(tok);
  }
  const sessionToken = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  sessionsByToken.set(sessionToken, { uid, expiresAt, createdAt: now });
  persistSessions();
  void flushNow();
  return { ...toAuthUser(user), sessionToken };
}

/** Trim + lowercase — same rules as {@link uidFromEmail} input. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function uidFromEmail(email: string): string {
  return crypto.createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

const MAX_PASSWORD_BYTES = 1024;

function validatePasswordLength(password: string): void {
  if (password.length < 8) {
    throw new ValidationError("Mot de passe trop court (min 8 caractères)");
  }
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
    throw new ValidationError("Mot de passe trop long");
  }
}

function pbkdf2Hash(password: string, saltB64: string): string {
  const salt = Buffer.from(saltB64, "base64");
  return crypto
    .pbkdf2Sync(password, salt, 310000, 32, "sha256")
    .toString("base64");
}

export interface RegisterInput {
  email: string;
  password: string;
  timezone?: string;
}

const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function generateVerifyToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Constant-time string equality via SHA-256 digests (mitigates timing leaks on secret tokens). */
function timingSafeEqualStrings(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a, "utf8").digest();
  const hb = crypto.createHash("sha256").update(b, "utf8").digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function register(input: RegisterInput): AuthUser & { verifyToken: string } {
  assertValidEmailFormat(input.email);
  const email = normalizeEmail(input.email);
  validatePasswordLength(input.password);

  const uid = uidFromEmail(email);
  const existing = usersByUid.get(uid);
  if (existing) {
    throw new AppError(409, "Compte déjà existant");
  }

  const saltB64 = crypto.randomBytes(16).toString("base64");
  const hashB64 = pbkdf2Hash(input.password, saltB64);
  const verifyToken = generateVerifyToken();

  const createdAt = new Date().toISOString();
  const tz = input.timezone && isValidTimezone(input.timezone) ? input.timezone : DEFAULT_WORKING_HOURS.timezone;
  const stored: StoredUser = {
    uid, email, firstName: "", lastName: "",
    passwordSaltB64: saltB64, passwordHashB64: hashB64,
    passwordUserChosen: true,
    effortMinutes: DEFAULT_EFFORT_MINUTES,
    workingHours: { ...DEFAULT_WORKING_HOURS, timezone: tz },
    emailVerified: false,
    emailVerifyToken: verifyToken,
    emailVerifyExpiresAt: Date.now() + VERIFY_TOKEN_TTL_MS,
    createdAt,
  };
  usersByUid.set(uid, stored);
  persistUsers();

  return { ...toAuthUser(stored), verifyToken };
}

/**
 * Validates the email verification token and marks the user as verified.
 */
export function verifyEmail(token: string): AuthUser {
  if (!token) throw new ValidationError("Token requis");

  for (const user of usersByUid.values()) {
    const stored = user.emailVerifyToken;
    if (stored && timingSafeEqualStrings(stored, token)) {
      if (user.emailVerifyExpiresAt && Date.now() > user.emailVerifyExpiresAt) {
        throw new AppError(410, "Lien de vérification expiré. Demandez un nouveau lien.");
      }
      user.emailVerified = true;
      delete user.emailVerifyToken;
      delete user.emailVerifyExpiresAt;
      persistUsers();
      return toAuthUser(user);
    }
  }

  throw new AppError(400, "Token de vérification invalide");
}

/**
 * Generates a new verification token and returns it for re-sending.
 */
export function resendVerificationToken(email: string): { verifyToken: string } {
  assertValidEmailFormat(email);
  const uid = uidFromEmail(normalizeEmail(email));
  const user = usersByUid.get(uid);
  if (!user) throw new NotFoundError("Utilisateur introuvable");
  if (user.emailVerified) throw new AppError(400, "Email déjà vérifié");

  const verifyToken = generateVerifyToken();
  user.emailVerifyToken = verifyToken;
  user.emailVerifyExpiresAt = Date.now() + VERIFY_TOKEN_TTL_MS;
  persistUsers();

  return { verifyToken };
}

const RESET_TOKEN_TTL_MS = 1 * 60 * 60 * 1000; // 1h

/**
 * Generates a password-reset token. Returns null silently if the email doesn't exist
 * (to avoid user enumeration).
 */
export function requestPasswordReset(email: string): { resetToken: string; email: string } | null {
  try {
    assertValidEmailFormat(email);
  } catch {
    return null;
  }
  const uid = uidFromEmail(normalizeEmail(email));
  const user = usersByUid.get(uid);
  if (!user) return null;

  const resetToken = crypto.randomBytes(32).toString("hex");
  user.resetToken = resetToken;
  user.resetTokenExpiresAt = Date.now() + RESET_TOKEN_TTL_MS;
  persistUsers();

  return { resetToken, email: user.email };
}

/**
 * Validates the reset token and sets a new password.
 */
export function resetPassword(token: string, newPassword: string): void {
  if (!token) throw new ValidationError("Token requis");
  validatePasswordLength(newPassword);

  for (const user of usersByUid.values()) {
    const stored = user.resetToken;
    if (stored && timingSafeEqualStrings(stored, token)) {
      if (user.resetTokenExpiresAt && Date.now() > user.resetTokenExpiresAt) {
        throw new AppError(410, "Lien de réinitialisation expiré. Demandez un nouveau lien.");
      }

      const saltB64 = crypto.randomBytes(16).toString("base64");
      user.passwordSaltB64 = saltB64;
      user.passwordHashB64 = pbkdf2Hash(newPassword, saltB64);
      user.passwordUserChosen = true;
      delete user.resetToken;
      delete user.resetTokenExpiresAt;

      for (const [tok, sess] of sessionsByToken) {
        if (sess.uid === user.uid) sessionsByToken.delete(tok);
      }
      persistSessions();
      persistUsers();
      return;
    }
  }

  throw new AppError(400, "Token de réinitialisation invalide");
}

export interface LoginInput {
  email: string;
  password: string;
  timezone?: string;
}

export function login(input: LoginInput): LoginResult {
  if (Buffer.byteLength(input.password, "utf8") > MAX_PASSWORD_BYTES) {
    throw new AppError(401, "Identifiants invalides");
  }

  try {
    assertValidEmailFormat(input.email);
  } catch {
    throw new AppError(401, "Identifiants invalides");
  }

  const email = normalizeEmail(input.email);
  const uid = uidFromEmail(email);
  const user = usersByUid.get(uid);
  if (!user) {
    throw new AppError(401, "Identifiants invalides");
  }

  const expectedHash = user.passwordHashB64;
  const actualHash = pbkdf2Hash(input.password, user.passwordSaltB64);
  if (
    expectedHash.length !== actualHash.length ||
    !crypto.timingSafeEqual(Buffer.from(expectedHash, "base64"), Buffer.from(actualHash, "base64"))
  ) {
    throw new AppError(401, "Identifiants invalides");
  }

  if (!user.emailVerified) {
    throw new AppError(403, "EMAIL_NOT_VERIFIED");
  }

  // Auto-fix timezone from client when it's missing or defaulted to UTC
  if (input.timezone && isValidTimezone(input.timezone)) {
    const currentTz = user.workingHours?.timezone ?? "UTC";
    if (currentTz === "UTC" || !user.workingHours) {
      user.workingHours = { ...(user.workingHours ?? DEFAULT_WORKING_HOURS), timezone: input.timezone };
      persistUsers();
    }
  }

  if (needsSecondFactorAfterPrimaryAuth(user)) {
    const pendingToken = createPendingTokenForUser(user);
    return {
      requiresTwoFactor: true,
      pendingToken,
      twoFactorMethods: twoFactorMethodsForPendingUser(user),
    };
  }

  return issueSessionToken(uid);
}

function extractSessionToken(cookies: string | undefined): string | null {
  if (!cookies) return null;
  const cookiePairs = cookies.split(";").map((v) => v.trim());
  let last: string | null = null;
  for (const p of cookiePairs) {
    if (p.startsWith(`${COOKIE_NAME}=`)) {
      last = p.slice(COOKIE_NAME.length + 1);
    }
  }
  return last;
}

export function getUserFromRequestCookies(cookies: string | undefined): AuthUser | null {
  const token = extractSessionToken(cookies);
  if (!token) return null;

  const session = sessionsByToken.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessionsByToken.delete(token);
    persistSessions();
    return null;
  }

  const user = usersByUid.get(session.uid);
  if (!user) return null;
  return toAuthUser(user);
}

export interface UpdateProfileInput {
  firstName?: string;
  lastName?: string;
  effortMinutes?: EffortMinutes;
  workingHours?: WorkingHours;
  skipNonWorkingDays?: boolean;
  notificationDeliveryMode?: NotificationDeliveryMode;
  notificationDeliveryWebhookUrl?: string | null;
  notificationTypesDisabledInApp?: string[];
  notificationTypesDisabledOutbound?: string[];
  notificationOutboundFrequency?: NotificationOutboundFrequency;
  notificationDigestHour?: number;
  archivedTaskRetentionDays?: number;
}

const HH_MM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function validateWorkingHours(wh: WorkingHours): void {
  if (!HH_MM_RE.test(wh.start)) throw new ValidationError("workingHours.start format invalide (HH:mm)");
  if (!HH_MM_RE.test(wh.end)) throw new ValidationError("workingHours.end format invalide (HH:mm)");
  if (wh.start >= wh.end) throw new ValidationError("workingHours.start doit être avant workingHours.end");
  if (typeof wh.timezone !== "string" || wh.timezone.length === 0) {
    throw new ValidationError("workingHours.timezone requis");
  }
  try {
    Intl.DateTimeFormat(undefined, { timeZone: wh.timezone });
  } catch {
    throw new ValidationError("workingHours.timezone invalide");
  }
  if (!Array.isArray(wh.daysOfWeek) || wh.daysOfWeek.length === 0) {
    throw new ValidationError("workingHours.daysOfWeek doit contenir au moins un jour");
  }
  for (const d of wh.daysOfWeek) {
    if (!Number.isInteger(d) || d < 0 || d > 6) {
      throw new ValidationError("workingHours.daysOfWeek valeurs entre 0 et 6");
    }
  }
}

function normalizeNotificationDeliveryModeInput(m: unknown): NotificationDeliveryMode {
  if (m === "none" || m === "email" || m === "slack" || m === "teams" || m === "google_chat") return m;
  throw new ValidationError("notificationDeliveryMode invalide");
}

export async function updateProfile(uid: string, input: UpdateProfileInput): Promise<AuthUser> {
  const user = usersByUid.get(uid);
  if (!user) throw new NotFoundError("Utilisateur introuvable");

  if (input.firstName !== undefined) user.firstName = input.firstName.trim().slice(0, 100);
  if (input.lastName !== undefined) user.lastName = input.lastName.trim().slice(0, 100);
  if (input.effortMinutes !== undefined) {
    const em = input.effortMinutes;
    if (typeof em.light !== "number" || typeof em.medium !== "number" || typeof em.heavy !== "number") {
      throw new ValidationError("effortMinutes: light, medium et heavy doivent être des nombres");
    }
    if (em.light < 1 || em.medium < 1 || em.heavy < 1) {
      throw new ValidationError("effortMinutes: les valeurs doivent être >= 1");
    }
    user.effortMinutes = em;
  }
  if (input.workingHours !== undefined) {
    validateWorkingHours(input.workingHours);
    user.workingHours = input.workingHours;
  }
  if (input.skipNonWorkingDays !== undefined) {
    user.skipNonWorkingDays = !!input.skipNonWorkingDays;
  }

  if (input.notificationDeliveryMode !== undefined || input.notificationDeliveryWebhookUrl !== undefined) {
    const mode =
      input.notificationDeliveryMode !== undefined
        ? normalizeNotificationDeliveryModeInput(input.notificationDeliveryMode)
        : readNotificationDeliveryMode(user);
    const urlFromInput = input.notificationDeliveryWebhookUrl;
    const url =
      urlFromInput !== undefined
        ? (typeof urlFromInput === "string" ? urlFromInput.trim() : "")
        : (user.notificationDeliveryWebhookUrl?.trim() ?? "");

    if (mode === "slack" || mode === "teams" || mode === "google_chat") {
      if (!url) {
        throw new ValidationError("URL du webhook requise pour Slack, Microsoft Teams ou Google Chat");
      }
      await validateWebhookUrl(url);
      user.notificationDeliveryMode = mode;
      user.notificationDeliveryWebhookUrl = url;
    } else {
      user.notificationDeliveryMode = mode;
      user.notificationDeliveryWebhookUrl = undefined;
    }
  }

  if (input.notificationTypesDisabledInApp !== undefined) {
    user.notificationTypesDisabledInApp = input.notificationTypesDisabledInApp.filter((t) => typeof t === "string").slice(0, 50);
  }
  if (input.notificationTypesDisabledOutbound !== undefined) {
    user.notificationTypesDisabledOutbound = input.notificationTypesDisabledOutbound.filter((t) => typeof t === "string").slice(0, 50);
  }
  if (input.notificationOutboundFrequency !== undefined) {
    const f = input.notificationOutboundFrequency;
    if (f !== "immediate" && f !== "hourly_digest" && f !== "daily_digest") {
      throw new ValidationError("notificationOutboundFrequency invalide");
    }
    user.notificationOutboundFrequency = f;
  }
  if (input.notificationDigestHour !== undefined) {
    const h = Math.floor(Number(input.notificationDigestHour));
    if (isNaN(h) || h < 0 || h > 23) throw new ValidationError("notificationDigestHour doit être entre 0 et 23");
    user.notificationDigestHour = h;
  }
  if (input.archivedTaskRetentionDays !== undefined) {
    const d = Math.floor(Number(input.archivedTaskRetentionDays));
    if (isNaN(d) || (d !== 0 && (d < 1 || d > 365))) {
      throw new ValidationError("archivedTaskRetentionDays doit être 0 (désactivé) ou entre 1 et 365");
    }
    user.archivedTaskRetentionDays = d;
  }

  usersByUid.set(uid, user);
  persistUsers();

  return toAuthUser(user);
}

/**
 * Preferences for mirroring in-app notifications (email / Slack / Teams / Google Chat).
 */
export function getNotificationDeliveryPrefs(uid: string): {
  mode: NotificationDeliveryMode;
  webhookUrl: string | null;
  email: string;
} | null {
  const user = usersByUid.get(uid);
  if (!user) return null;
  return {
    mode: readNotificationDeliveryMode(user),
    webhookUrl: user.notificationDeliveryWebhookUrl?.trim() || null,
    email: user.email,
  };
}

/**
 * Per-type filter preferences for in-app and outbound notifications, plus outbound frequency.
 */
export function getNotificationFilterPrefs(uid: string): {
  disabledInApp: string[];
  disabledOutbound: string[];
  frequency: NotificationOutboundFrequency;
  digestHour: number;
  timezone: string;
} | null {
  const user = usersByUid.get(uid);
  if (!user) return null;
  return {
    disabledInApp: Array.isArray(user.notificationTypesDisabledInApp) ? user.notificationTypesDisabledInApp : [],
    disabledOutbound: Array.isArray(user.notificationTypesDisabledOutbound) ? user.notificationTypesDisabledOutbound : [],
    frequency: readNotificationOutboundFrequency(user),
    digestHour: typeof user.notificationDigestHour === "number" ? Math.max(0, Math.min(23, Math.floor(user.notificationDigestHour))) : 8,
    timezone: user.workingHours?.timezone ?? "Europe/Paris",
  };
}

/**
 * Look up a user by email. Returns the public AuthUser or null.
 */
export function findUserByEmail(email: string): AuthUser | null {
  const uid = uidFromEmail(email);
  const user = usersByUid.get(uid);
  if (!user) return null;
  return toAuthUser(user);
}

/**
 * Look up a user by uid. Returns the public AuthUser or null.
 */
export function findUserByUid(uid: string): AuthUser | null {
  const user = usersByUid.get(uid);
  if (!user) return null;
  return toAuthUser(user);
}

/**
 * Logs in (or registers) a user via Google SSO.
 * The email is auto-verified since Google has already validated it.
 */
export function loginWithGoogle(profile: { email: string; firstName: string; lastName: string; timezone?: string }): LoginResult {
  const email = normalizeEmail(profile.email);
  const uid = uidFromEmail(email);
  let user = usersByUid.get(uid);

  const tz = profile.timezone && isValidTimezone(profile.timezone) ? profile.timezone : DEFAULT_WORKING_HOURS.timezone;

  if (!user) {
    const saltB64 = crypto.randomBytes(16).toString("base64");
    const randomPass = crypto.randomBytes(32).toString("hex");
    const hashB64 = pbkdf2Hash(randomPass, saltB64);

    user = {
      uid, email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      passwordSaltB64: saltB64,
      passwordHashB64: hashB64,
      passwordUserChosen: false,
      effortMinutes: DEFAULT_EFFORT_MINUTES,
      workingHours: { ...DEFAULT_WORKING_HOURS, timezone: tz },
      emailVerified: true,
      createdAt: new Date().toISOString(),
    };
    usersByUid.set(uid, user);
    persistUsers();
    console.log("[auth] Google SSO — new user created: %s (tz: %s)", email, tz);
  } else {
    let changed = false;
    if (!user.emailVerified) { user.emailVerified = true; changed = true; }
    if (!user.firstName && profile.firstName) {
      user.firstName = profile.firstName;
      user.lastName = profile.lastName;
      changed = true;
    }
    const currentTz = user.workingHours?.timezone ?? "UTC";
    if (currentTz === "UTC" && tz !== "UTC") {
      user.workingHours = { ...(user.workingHours ?? DEFAULT_WORKING_HOURS), timezone: tz };
      changed = true;
    }
    if (changed) persistUsers();
  }

  if (needsSecondFactorAfterPrimaryAuth(user)) {
    const pendingToken = createPendingTokenForUser(user);
    return {
      requiresTwoFactor: true,
      pendingToken,
      twoFactorMethods: twoFactorMethodsForPendingUser(user),
    };
  }

  return issueSessionToken(uid);
}

/** After password or Google pre-auth, validate TOTP and/or email OTP and open session */
export function verifyTwoFactorLogin(pendingToken: string, code: string): LoginSuccess {
  const row = getPendingRow(pendingToken);
  if (!row) {
    throw new AppError(401, "Session 2FA expirée ou invalide. Reconnectez-vous.");
  }
  const user = usersByUid.get(row.uid);
  if (!user) {
    throw new AppError(401, "Session 2FA expirée ou invalide. Reconnectez-vous.");
  }
  const mode = row.mode ?? "totp";
  let ok = false;
  if (mode === "email_only") {
    ok = verifyEmailOtpOnRow(row, code);
  } else if (mode === "totp") {
    ok = !!(user.totpSecretB64 && verifyTotpCode(user.totpSecretB64, code));
  } else if (mode === "totp_or_email") {
    ok =
      !!(user.totpSecretB64 && verifyTotpCode(user.totpSecretB64, code))
      || verifyEmailOtpOnRow(row, code);
  }
  if (!ok) {
    throw new AppError(401, "Code d'authentification invalide");
  }
  deletePendingToken(pendingToken);
  return issueSessionToken(row.uid);
}

export function beginTotpSetup(uid: string): { otpauthUrl: string; secret: string } {
  const user = usersByUid.get(uid);
  if (!user) throw new NotFoundError("Utilisateur introuvable");
  if (user.emailOtp2faEnabled) {
    throw new AppError(400, "Désactivez d'abord la 2FA par email dans les paramètres");
  }
  if (user.totpEnabled && user.totpSecretB64) {
    throw new AppError(400, "La double authentification est déjà activée");
  }
  const secret = generateTotpSecret();
  user.totpPendingSecretB64 = secret;
  usersByUid.set(uid, user);
  persistUsers();
  return {
    otpauthUrl: buildKeyUri(user.email, secret),
    secret,
  };
}

export function completeTotpSetup(uid: string, code: string): AuthUser {
  const user = usersByUid.get(uid);
  if (!user) throw new NotFoundError("Utilisateur introuvable");
  const pending = user.totpPendingSecretB64;
  if (!pending) {
    throw new AppError(400, "Aucune configuration 2FA en cours. Lancez d'abord l'appairage.");
  }
  if (!verifyTotpCode(pending, code)) {
    throw new AppError(400, "Code incorrect");
  }
  user.totpSecretB64 = pending;
  user.totpEnabled = true;
  user.emailOtp2faEnabled = false;
  delete user.totpPendingSecretB64;
  usersByUid.set(uid, user);
  persistUsers();
  return toAuthUser(user);
}

/** True when disabling 2FA must also verify the account password (not SSO placeholder). */
export function twoFactorDisableRequiresPassword(uid: string): boolean {
  const user = usersByUid.get(uid);
  return user?.passwordUserChosen === true;
}

export function disableTotp(uid: string, password: string | undefined, code: string): void {
  const user = usersByUid.get(uid);
  if (!user) throw new NotFoundError("Utilisateur introuvable");
  if (!user.totpEnabled || !user.totpSecretB64) {
    throw new AppError(400, "La double authentification n'est pas activée");
  }
  const mustVerifyPassword = user.passwordUserChosen === true;
  if (mustVerifyPassword) {
    if (!user.passwordSaltB64 || !user.passwordHashB64) {
      throw new AppError(400, "Mot de passe non configuré");
    }
    if (password === undefined || password === "") {
      throw new ValidationError("Mot de passe requis");
    }
    const actualHash = pbkdf2Hash(password, user.passwordSaltB64);
    const expectedHash = user.passwordHashB64;
    if (
      expectedHash.length !== actualHash.length ||
      !crypto.timingSafeEqual(Buffer.from(expectedHash, "base64"), Buffer.from(actualHash, "base64"))
    ) {
      throw new AppError(401, "Mot de passe incorrect");
    }
  }
  if (!verifyTotpCode(user.totpSecretB64, code)) {
    throw new AppError(401, "Code d'authentification invalide");
  }
  delete user.totpEnabled;
  delete user.totpSecretB64;
  delete user.totpPendingSecretB64;
  usersByUid.set(uid, user);
  for (const [tok, sess] of sessionsByToken) {
    if (sess.uid === uid) sessionsByToken.delete(tok);
  }
  persistSessions();
  persistUsers();
}

export function cancelTotpSetup(uid: string): void {
  const user = usersByUid.get(uid);
  if (!user) throw new NotFoundError("Utilisateur introuvable");
  if (user.totpPendingSecretB64 && !user.totpEnabled) {
    delete user.totpPendingSecretB64;
    usersByUid.set(uid, user);
    persistUsers();
  }
}

const EMAIL_OTP_ENROLL_TTL_MS = 10 * 60 * 1000;

function verifyEmailOtpHash(
  storedHash: string | undefined,
  expiresAt: number | undefined,
  code: string,
): boolean {
  if (!storedHash || !expiresAt || Date.now() > expiresAt) return false;
  const digits = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(digits)) return false;
  const h = crypto.createHash("sha256").update(digits).digest("hex");
  if (h.length !== storedHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(h, "hex"), Buffer.from(storedHash, "hex"));
}

export async function requestEmail2faEnrollment(uid: string, locale: "fr" | "en"): Promise<void> {
  const user = usersByUid.get(uid);
  if (!user) throw new NotFoundError("Utilisateur introuvable");
  if (!user.emailVerified) {
    throw new AppError(400, "Vérifiez votre adresse email avant d'activer la 2FA par email");
  }
  if (user.totpEnabled && user.totpSecretB64) {
    throw new AppError(400, "Désactivez d'abord l'authentificateur dans les paramètres");
  }
  if (user.emailOtp2faEnabled) {
    throw new AppError(400, "La 2FA par email est déjà activée");
  }
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  user.email2faEnrollHash = crypto.createHash("sha256").update(code).digest("hex");
  user.email2faEnrollExpiresAt = Date.now() + EMAIL_OTP_ENROLL_TTL_MS;
  usersByUid.set(uid, user);
  persistUsers();
  await sendEmailOtpEmail(user.email, code, "enrollment", locale);
}

export function confirmEmail2faEnrollment(uid: string, code: string): AuthUser {
  const user = usersByUid.get(uid);
  if (!user) throw new NotFoundError("Utilisateur introuvable");
  if (!verifyEmailOtpHash(user.email2faEnrollHash, user.email2faEnrollExpiresAt, code)) {
    throw new AppError(400, "Code incorrect ou expiré");
  }
  delete user.email2faEnrollHash;
  delete user.email2faEnrollExpiresAt;
  user.emailOtp2faEnabled = true;
  delete user.totpEnabled;
  delete user.totpSecretB64;
  delete user.totpPendingSecretB64;
  usersByUid.set(uid, user);
  persistUsers();
  return toAuthUser(user);
}

export function setTotpEmailFallback(uid: string, enabled: boolean): AuthUser {
  const user = usersByUid.get(uid);
  if (!user) throw new NotFoundError("Utilisateur introuvable");
  if (!(user.totpEnabled && user.totpSecretB64)) {
    throw new AppError(400, "L'authentificateur n'est pas activé");
  }
  user.totpEmailFallbackEnabled = enabled;
  usersByUid.set(uid, user);
  persistUsers();
  return toAuthUser(user);
}

export async function requestDisableEmail2faOtp(uid: string, locale: "fr" | "en"): Promise<void> {
  const user = usersByUid.get(uid);
  if (!user) throw new NotFoundError("Utilisateur introuvable");
  if (!user.emailOtp2faEnabled) {
    throw new AppError(400, "La 2FA par email n'est pas activée");
  }
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  user.email2faDisableHash = crypto.createHash("sha256").update(code).digest("hex");
  user.email2faDisableExpiresAt = Date.now() + EMAIL_OTP_ENROLL_TTL_MS;
  usersByUid.set(uid, user);
  persistUsers();
  await sendEmailOtpEmail(user.email, code, "disable", locale);
}

export function disableEmailOtp2fa(uid: string, password: string | undefined, code: string): void {
  const user = usersByUid.get(uid);
  if (!user) throw new NotFoundError("Utilisateur introuvable");
  if (!user.emailOtp2faEnabled) {
    throw new AppError(400, "La 2FA par email n'est pas activée");
  }
  const mustVerifyPassword = user.passwordUserChosen === true;
  if (mustVerifyPassword) {
    if (!user.passwordSaltB64 || !user.passwordHashB64) {
      throw new AppError(400, "Mot de passe non configuré");
    }
    if (password === undefined || password === "") {
      throw new ValidationError("Mot de passe requis");
    }
    const actualHash = pbkdf2Hash(password, user.passwordSaltB64);
    const expectedHash = user.passwordHashB64;
    if (
      expectedHash.length !== actualHash.length ||
      !crypto.timingSafeEqual(Buffer.from(expectedHash, "base64"), Buffer.from(actualHash, "base64"))
    ) {
      throw new AppError(401, "Mot de passe incorrect");
    }
  }
  if (!verifyEmailOtpHash(user.email2faDisableHash, user.email2faDisableExpiresAt, code)) {
    throw new AppError(401, "Code incorrect ou expiré");
  }
  delete user.emailOtp2faEnabled;
  delete user.email2faDisableHash;
  delete user.email2faDisableExpiresAt;
  usersByUid.set(uid, user);
  for (const [tok, sess] of sessionsByToken) {
    if (sess.uid === uid) sessionsByToken.delete(tok);
  }
  persistSessions();
  persistUsers();
}

export function changePassword(uid: string, currentPassword: string, newPassword: string, currentSessionToken?: string): void {
  const user = usersByUid.get(uid);
  if (!user) throw new NotFoundError("Utilisateur introuvable");

  if (!user.passwordSaltB64 || !user.passwordHashB64) {
    throw new AppError(400, "Compte créé via Google SSO — utilisez la réinitialisation par email pour définir un mot de passe");
  }

  const currentHash = pbkdf2Hash(currentPassword, user.passwordSaltB64);
  const a = Buffer.from(currentHash, "base64");
  const b = Buffer.from(user.passwordHashB64, "base64");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new AppError(401, "Mot de passe actuel incorrect");
  }

  validatePasswordLength(newPassword);

  const saltB64 = crypto.randomBytes(16).toString("base64");
  user.passwordSaltB64 = saltB64;
  user.passwordHashB64 = pbkdf2Hash(newPassword, saltB64);
  user.passwordUserChosen = true;

  for (const [tok, sess] of sessionsByToken) {
    if (sess.uid === uid && tok !== currentSessionToken) sessionsByToken.delete(tok);
  }
  persistSessions();
  persistUsers();
}

export function logout(cookies: string | undefined): void {
  const token = extractSessionToken(cookies);
  if (token) {
    sessionsByToken.delete(token);
    persistSessions();
    void flushNow();
  }
}

// ── Google Accounts (multi-account) ──

export function getGoogleAccounts(uid: string): GoogleAccount[] {
  const user = usersByUid.get(uid);
  if (!user) return [];
  return resolveGoogleAccounts(user);
}

const MAX_GOOGLE_ACCOUNTS = 5;

export function addGoogleAccount(uid: string, email: string, tokens: GoogleCalendarTokens): GoogleAccount {
  const user = usersByUid.get(uid);
  if (!user) throw new NotFoundError("Utilisateur introuvable");
  migrateGoogleAccounts(user);
  const accounts = user.googleAccounts ?? [];
  const existing = accounts.find((a) => a.email === email);
  if (existing) {
    if (tokens.refreshToken) {
      existing.tokens = tokens;
    } else {
      existing.tokens.accessToken = tokens.accessToken;
      existing.tokens.expiresAt = tokens.expiresAt;
    }
    persistUsers();
    return existing;
  }
  if (accounts.length >= MAX_GOOGLE_ACCOUNTS) {
    throw new ValidationError(`Maximum ${MAX_GOOGLE_ACCOUNTS} comptes Google autorisés`);
  }
  const account: GoogleAccount = {
    id: crypto.randomUUID(),
    email,
    tokens,
    calendars: [],
  };
  accounts.push(account);
  user.googleAccounts = accounts;
  persistUsers();
  return account;
}

export function getGoogleAccountTokens(uid: string, accountId: string): GoogleCalendarTokens | null {
  const accounts = getGoogleAccounts(uid);
  return accounts.find((a) => a.id === accountId)?.tokens ?? null;
}

export function updateGoogleAccountTokens(uid: string, accountId: string, tokens: GoogleCalendarTokens): void {
  const user = usersByUid.get(uid);
  if (!user) return;
  const accounts = resolveGoogleAccounts(user);
  const account = accounts.find((a) => a.id === accountId);
  if (account) {
    account.tokens = tokens;
    persistUsers();
  }
}

export function removeGoogleAccount(uid: string, accountId: string): void {
  const user = usersByUid.get(uid);
  if (!user) throw new NotFoundError("Utilisateur introuvable");
  migrateGoogleAccounts(user);
  const accounts = user.googleAccounts ?? [];
  const exists = accounts.some((a) => a.id === accountId);
  if (!exists) throw new NotFoundError("Compte Google introuvable");
  user.googleAccounts = accounts.filter((a) => a.id !== accountId);
  persistUsers();
}

export function removeAllGoogleAccounts(uid: string): void {
  const user = usersByUid.get(uid);
  if (!user) return;
  delete user.googleCalendarTokens;
  delete user.googleCalendars;
  delete user.googleAccounts;
  persistUsers();
}

export function setGoogleAccountCalendars(uid: string, accountId: string, calendars: GoogleCalendarEntry[]): void {
  const user = usersByUid.get(uid);
  if (!user) throw new NotFoundError("Utilisateur introuvable");
  const accounts = resolveGoogleAccounts(user);
  const account = accounts.find((a) => a.id === accountId);
  if (!account) throw new NotFoundError("Compte Google introuvable");
  // Normalize to a single booking default per account and keep it on an enabled calendar.
  let chosenDefault: string | null = null;
  for (const cal of calendars) {
    if (cal.defaultForBooking && cal.canWriteBooking !== false) {
      chosenDefault = cal.calendarId;
      break;
    }
  }
  if (!chosenDefault) {
    const firstWritableEnabled = calendars.find((cal) => !!cal.enabled && cal.canWriteBooking !== false);
    chosenDefault = firstWritableEnabled?.calendarId ?? null;
  }
  account.calendars = calendars.map((cal, idx) => {
    const enabled = !!cal.enabled;
    const canWriteBooking = cal.canWriteBooking !== false;
    const defaultForBooking = chosenDefault
      ? cal.calendarId === chosenDefault && enabled && canWriteBooking
      : idx === 0 && enabled && canWriteBooking;
    return {
      ...cal,
      enabled,
      canWriteBooking,
      defaultForBooking,
    };
  });
  persistUsers();
}

export function getGoogleBookingTarget(uid: string): { accountId: string; calendarId: string } | null {
  const accounts = getGoogleAccounts(uid);
  if (accounts.length === 0) return null;

  const isSystemCalendar = (calendarId: string): boolean => {
    const id = calendarId.toLowerCase();
    return id.includes("group.v.calendar.google.com") || id.includes("holiday") || id.includes("weeknum");
  };
  const isWritable = (cal: GoogleCalendarEntry): boolean =>
    !!cal.enabled && cal.canWriteBooking !== false && !isSystemCalendar(cal.calendarId);

  for (const account of accounts) {
    const selected = account.calendars.find((c) => c.defaultForBooking && isWritable(c));
    if (selected) return { accountId: account.id, calendarId: selected.calendarId };
  }

  for (const account of accounts) {
    const writablePrimary = account.calendars.find((c) => !!c.primary && isWritable(c));
    if (writablePrimary) return { accountId: account.id, calendarId: writablePrimary.calendarId };
    const firstWritable = account.calendars.find((c) => isWritable(c));
    if (firstWritable) return { accountId: account.id, calendarId: firstWritable.calendarId };
  }

  return { accountId: accounts[0]!.id, calendarId: "primary" };
}

// Legacy compat wrappers (used by bookSlot/clearSlot for write operations on first account)
export function getGoogleCalendarTokens(uid: string): GoogleCalendarTokens | null {
  const accounts = getGoogleAccounts(uid);
  return accounts[0]?.tokens ?? null;
}

export function setGoogleCalendarTokens(uid: string, tokens: GoogleCalendarTokens): void {
  const user = usersByUid.get(uid);
  if (!user) throw new NotFoundError("Utilisateur introuvable");
  migrateGoogleAccounts(user);
  const accounts = user.googleAccounts ?? [];
  if (accounts.length > 0) {
    accounts[0].tokens = tokens;
  } else {
    accounts.push({ id: crypto.randomUUID(), email: "Google Calendar", tokens, calendars: [] });
    user.googleAccounts = accounts;
  }
  persistUsers();
}

export function getActiveSessions(): Array<{ uid: string; email: string; expiresAt: number }> {
  const now = Date.now();
  const sessions: Array<{ uid: string; email: string; expiresAt: number }> = [];
  for (const [, session] of sessionsByToken) {
    if (now <= session.expiresAt) {
      const user = usersByUid.get(session.uid);
      sessions.push({ uid: session.uid, email: user?.email ?? "?", expiresAt: session.expiresAt });
    }
  }
  return sessions;
}

export function countGoogleCalendarConnected(): number {
  let count = 0;
  for (const user of usersByUid.values()) {
    migrateGoogleAccounts(user);
    if ((user.googleAccounts ?? []).length > 0) count++;
  }
  return count;
}

export { COOKIE_NAME };
