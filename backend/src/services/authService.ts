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
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris",
  daysOfWeek: [1, 2, 3, 4, 5],
};

export interface GoogleCalendarTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

export interface AuthUser {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  effortMinutes: EffortMinutes;
  workingHours: WorkingHours;
  googleCalendarConnected: boolean;
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
  googleCalendarTokens?: GoogleCalendarTokens;
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
  scheduleSave();
}

function persistSessions(): void {
  const obj: Record<string, StoredSession> = {};
  sessionsByToken.forEach((v, k) => { obj[k] = v; });
  const store = getStore();
  store.sessions = obj;
  scheduleSave();
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

function toAuthUser(user: StoredUser): AuthUser {
  return {
    uid: user.uid,
    email: user.email,
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    effortMinutes: user.effortMinutes ?? DEFAULT_EFFORT_MINUTES,
    workingHours: user.workingHours ?? DEFAULT_WORKING_HOURS,
    googleCalendarConnected: !!user.googleCalendarTokens,
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
}

export function register(input: RegisterInput): AuthUser {
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

  const createdAt = new Date().toISOString();
  const stored: StoredUser = { uid, email, firstName: "", lastName: "", passwordSaltB64: saltB64, passwordHashB64: hashB64, effortMinutes: DEFAULT_EFFORT_MINUTES, createdAt };
  usersByUid.set(uid, stored);
  persistUsers();

  return toAuthUser(stored);
}

export interface LoginInput {
  email: string;
  password: string;
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

export function logout(cookies: string | undefined): void {
  const token = extractSessionToken(cookies);
  if (token) {
    sessionsByToken.delete(token);
    persistSessions();
  }
}

export function setGoogleCalendarTokens(uid: string, tokens: GoogleCalendarTokens): void {
  const user = usersByUid.get(uid);
  if (!user) throw new NotFoundError("Utilisateur introuvable");
  user.googleCalendarTokens = tokens;
  usersByUid.set(uid, user);
  persistUsers();
}

export function getGoogleCalendarTokens(uid: string): GoogleCalendarTokens | null {
  const user = usersByUid.get(uid);
  return user?.googleCalendarTokens ?? null;
}

export function removeGoogleCalendarTokens(uid: string): void {
  const user = usersByUid.get(uid);
  if (!user) return;
  delete user.googleCalendarTokens;
  usersByUid.set(uid, user);
  persistUsers();
}

export { COOKIE_NAME };
