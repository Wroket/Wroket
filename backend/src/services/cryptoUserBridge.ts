import { getStore } from "../persistence";

/** Minimal shape needed for crypto (avoids circular import with authService). */
export type CryptoUserRow = { wrappedDekB64?: string };

let lookupUserRow: ((uid: string) => CryptoUserRow | undefined) | null = null;

/**
 * authService registers this once at load so userDekService can resolve users
 * even if store.users is briefly out of sync with the in-memory session map.
 */
export function registerCryptoUserLookup(fn: (uid: string) => CryptoUserRow | undefined): void {
  lookupUserRow = fn;
}

/**
 * Returns store.users[uid], or attaches the row from the auth map into store.users.
 */
export function getOrAttachStoreUser(uid: string): CryptoUserRow | undefined {
  const store = getStore();
  const users = store.users as Record<string, CryptoUserRow> | undefined;
  const existing = users?.[uid];
  if (existing) return existing;

  const mem = lookupUserRow?.(uid);
  if (!mem) return undefined;

  if (!store.users) {
    store.users = {};
  }
  (store.users as Record<string, CryptoUserRow>)[uid] = mem;
  return mem;
}
