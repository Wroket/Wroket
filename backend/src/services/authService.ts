import crypto from "crypto";

import { loadStore, saveStore } from "../persistence";

export interface AuthUser {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
}

interface StoredUser {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  passwordSaltB64: string;
  passwordHashB64: string;
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
  const store = loadStore();
  store.users = obj;
  saveStore(store);
}

// Chargement initial depuis le fichier local
(function hydrateUsers() {
  const store = loadStore();
  if (store.users) {
    for (const [k, v] of Object.entries(store.users)) {
      usersByUid.set(k, v as StoredUser);
    }
    console.log("[auth] %d utilisateur(s) chargé(s) depuis le fichier local", usersByUid.size);
  }
})();

const COOKIE_NAME = "auth_token";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function uidFromEmail(email: string): string {
  // DocId stable sans exposer l'email brut.
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
    throw new Error("Email invalide");
  }
  if (input.password.length < 8) {
    throw new Error("Mot de passe trop court (min 8 caractères)");
  }

  const uid = uidFromEmail(email);
  const existing = usersByUid.get(uid);
  if (existing) {
    throw new Error("Compte déjà existant");
  }

  const saltB64 = crypto.randomBytes(16).toString("base64");
  const hashB64 = pbkdf2Hash(input.password, saltB64);

  const createdAt = new Date().toISOString();
  usersByUid.set(uid, { uid, email, firstName: "", lastName: "", passwordSaltB64: saltB64, passwordHashB64: hashB64, createdAt });
  persistUsers();

  return { uid, email, firstName: "", lastName: "" };
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
    throw new Error("Identifiants invalides");
  }

  const expectedHash = user.passwordHashB64;
  const actualHash = pbkdf2Hash(input.password, user.passwordSaltB64);
  if (
    expectedHash.length !== actualHash.length ||
    !crypto.timingSafeEqual(Buffer.from(expectedHash, "base64"), Buffer.from(actualHash, "base64"))
  ) {
    throw new Error("Identifiants invalides");
  }

  const sessionToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessionsByToken.set(sessionToken, { uid, expiresAt });

  return { uid, email, firstName: user.firstName ?? "", lastName: user.lastName ?? "", sessionToken };
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
    return null;
  }

  const user = usersByUid.get(session.uid);
  if (!user) return null;
  return { uid: user.uid, email: user.email, firstName: user.firstName ?? "", lastName: user.lastName ?? "" };
}

export interface UpdateProfileInput {
  firstName?: string;
  lastName?: string;
}

export function updateProfile(uid: string, input: UpdateProfileInput): AuthUser {
  const user = usersByUid.get(uid);
  if (!user) throw new Error("Utilisateur introuvable");

  if (input.firstName !== undefined) user.firstName = input.firstName.trim().slice(0, 100);
  if (input.lastName !== undefined) user.lastName = input.lastName.trim().slice(0, 100);

  usersByUid.set(uid, user);
  persistUsers();

  return { uid: user.uid, email: user.email, firstName: user.firstName, lastName: user.lastName };
}

export function logout(cookies: string | undefined): void {
  const token = extractSessionToken(cookies);
  if (token) {
    sessionsByToken.delete(token);
  }
}

export { COOKIE_NAME };

