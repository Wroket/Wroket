import { NotFoundError, ValidationError } from "../utils/errors";

export interface StoredPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: string;
  userAgent?: string;
}

/** Raw push subscription JSON from the browser Push API. */
export interface BrowserPushSubscription {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
}

type UserPushAccess = {
  getUser(uid: string): {
    webPushEnabled?: boolean;
    pushSubscriptions?: StoredPushSubscription[];
  } | undefined;
  persistUser(uid: string, user: {
    webPushEnabled?: boolean;
    pushSubscriptions?: StoredPushSubscription[];
  }): void;
};

let userAccess: UserPushAccess | null = null;

/** Wired from authService at module load to avoid circular imports. */
export function wirePushSubscriptionUserAccess(access: UserPushAccess): void {
  userAccess = access;
}

function requireAccess(): UserPushAccess {
  if (!userAccess) throw new Error("pushSubscriptionService: user access not wired");
  return userAccess;
}

function validateBrowserSubscription(raw: unknown): BrowserPushSubscription {
  if (!raw || typeof raw !== "object") throw new ValidationError("subscription invalide");
  const sub = raw as Record<string, unknown>;
  const endpoint = sub.endpoint;
  const keys = sub.keys as Record<string, unknown> | undefined;
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://")) {
    throw new ValidationError("subscription.endpoint invalide");
  }
  if (!keys || typeof keys.p256dh !== "string" || typeof keys.auth !== "string") {
    throw new ValidationError("subscription.keys invalide");
  }
  return {
    endpoint,
    expirationTime: typeof sub.expirationTime === "number" ? sub.expirationTime : null,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
  };
}

export function getWebPushEnabled(uid: string): boolean {
  const user = requireAccess().getUser(uid);
  return user?.webPushEnabled === true;
}

export function setWebPushEnabled(uid: string, enabled: boolean): void {
  const access = requireAccess();
  const user = access.getUser(uid);
  if (!user) throw new NotFoundError("Utilisateur introuvable");
  user.webPushEnabled = enabled;
  if (!enabled) user.pushSubscriptions = [];
  access.persistUser(uid, user);
}

export function listPushSubscriptions(uid: string): StoredPushSubscription[] {
  const user = requireAccess().getUser(uid);
  return Array.isArray(user?.pushSubscriptions) ? user.pushSubscriptions : [];
}

export function upsertPushSubscription(
  uid: string,
  raw: unknown,
  userAgent?: string,
): StoredPushSubscription {
  const access = requireAccess();
  const user = access.getUser(uid);
  if (!user) throw new NotFoundError("Utilisateur introuvable");

  const sub = validateBrowserSubscription(raw);
  const stored: StoredPushSubscription = {
    endpoint: sub.endpoint,
    keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    createdAt: new Date().toISOString(),
    userAgent: userAgent?.slice(0, 200),
  };

  const list = Array.isArray(user.pushSubscriptions) ? [...user.pushSubscriptions] : [];
  const idx = list.findIndex((s) => s.endpoint === stored.endpoint);
  if (idx >= 0) list[idx] = stored;
  else list.push(stored);
  user.pushSubscriptions = list.slice(-10);
  user.webPushEnabled = true;
  access.persistUser(uid, user);
  return stored;
}

/** Returns number of subscriptions removed. */
export function removePushSubscriptions(uid: string, endpoint?: string): number {
  const access = requireAccess();
  const user = access.getUser(uid);
  if (!user) throw new NotFoundError("Utilisateur introuvable");

  const list = Array.isArray(user.pushSubscriptions) ? user.pushSubscriptions : [];
  if (!endpoint) {
    const count = list.length;
    user.pushSubscriptions = [];
    user.webPushEnabled = false;
    access.persistUser(uid, user);
    return count;
  }

  const trimmed = endpoint.trim();
  const next = list.filter((s) => s.endpoint !== trimmed);
  const removed = list.length - next.length;
  user.pushSubscriptions = next;
  if (next.length === 0) user.webPushEnabled = false;
  access.persistUser(uid, user);
  return removed;
}
