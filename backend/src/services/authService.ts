import crypto from "crypto";

import { getStore, scheduleSave } from "../persistence";
import { AppError, NotFoundError, ValidationError } from "../utils/errors";

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

export interface AuthUser {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  effortMinutes: EffortMinutes;
  workingHours: WorkingHours;
  googleCalendarConnected: boolean;
  googleAccounts: GoogleAccountPublic[];
  emailVerified: boolean;
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
  emailVerified?: boolean;
  emailVerifyToken?: string;
  emailVerifyExpiresAt?: number;
  resetToken?: string;
  resetTokenExpiresAt?: number;
  createdAt: string;
}

interface StoredSession {
  uid: string;
  expiresAt: number;
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

function toAuthUser(user: StoredUser): AuthUser {
  const accounts = resolveGoogleAccounts(user);
  return {
    uid: user.uid,
    email: user.email,
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    effortMinutes: user.effortMinutes ?? DEFAULT_EFFORT_MINUTES,
    workingHours: user.workingHours ?? DEFAULT_WORKING_HOURS,
    googleCalendarConnected: accounts.length > 0,
    googleAccounts: accounts.map((a) => ({ id: a.id, email: a.email, calendars: a.calendars })),
    emailVerified: user.emailVerified ?? false,
  };
}

const COOKIE_NAME = "auth_token";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function uidFromEmail(email: string): string {
  return crypto.createHash("sha256").update(normalizeEmail(email)).digest("hex");
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

export function register(input: RegisterInput): AuthUser & { verifyToken: string } {
  const email = normalizeEmail(input.email);
  if (!email || !email.includes("@")) {
    throw new ValidationError("Email invalide");
  }
  if (input.password.length < 8) {
    throw new ValidationError("Mot de passe trop court (min 8 caractères)");
  }

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
    if (user.emailVerifyToken === token) {
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
  if (newPassword.length < 8) {
    throw new ValidationError("Mot de passe trop court (min 8 caractères)");
  }

  for (const user of usersByUid.values()) {
    if (user.resetToken === token) {
      if (user.resetTokenExpiresAt && Date.now() > user.resetTokenExpiresAt) {
        throw new AppError(410, "Lien de réinitialisation expiré. Demandez un nouveau lien.");
      }

      const saltB64 = crypto.randomBytes(16).toString("base64");
      user.passwordSaltB64 = saltB64;
      user.passwordHashB64 = pbkdf2Hash(newPassword, saltB64);
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

export function login(input: LoginInput): AuthUser & { sessionToken: string } {
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

  for (const [tok, sess] of sessionsByToken) {
    if (sess.uid === uid) sessionsByToken.delete(tok);
  }

  const sessionToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessionsByToken.set(sessionToken, { uid, expiresAt });
  persistSessions();

  return { ...toAuthUser(user), sessionToken };
}

function extractSessionToken(cookies: string | undefined): string | null {
  if (!cookies) return null;
  const cookiePairs = cookies.split(";").map((v) => v.trim());
  const match = cookiePairs.find((p) => p.startsWith(`${COOKIE_NAME}=`));
  if (!match) return null;
  return match.slice(COOKIE_NAME.length + 1);
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

export function updateProfile(uid: string, input: UpdateProfileInput): AuthUser {
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

  usersByUid.set(uid, user);
  persistUsers();

  return toAuthUser(user);
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
export function loginWithGoogle(profile: { email: string; firstName: string; lastName: string; timezone?: string }): AuthUser & { sessionToken: string } {
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

  for (const [tok, sess] of sessionsByToken) {
    if (sess.uid === uid) sessionsByToken.delete(tok);
  }

  const sessionToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessionsByToken.set(sessionToken, { uid, expiresAt });
  persistSessions();

  return { ...toAuthUser(user), sessionToken };
}

export function changePassword(uid: string, currentPassword: string, newPassword: string, currentSessionToken?: string): void {
  const user = usersByUid.get(uid);
  if (!user) throw new NotFoundError("Utilisateur introuvable");

  if (!user.passwordSaltB64 || !user.passwordHashB64) {
    throw new AppError(400, "Compte créé via Google SSO — utilisez la réinitialisation par email pour définir un mot de passe");
  }

  const currentHash = pbkdf2Hash(currentPassword, user.passwordSaltB64);
  if (!crypto.timingSafeEqual(Buffer.from(currentHash, "base64"), Buffer.from(user.passwordHashB64, "base64"))) {
    throw new AppError(401, "Mot de passe actuel incorrect");
  }

  if (newPassword.length < 8) {
    throw new ValidationError("Nouveau mot de passe trop court (min 8 caractères)");
  }

  const saltB64 = crypto.randomBytes(16).toString("base64");
  user.passwordSaltB64 = saltB64;
  user.passwordHashB64 = pbkdf2Hash(newPassword, saltB64);

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
  account.calendars = calendars;
  persistUsers();
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
