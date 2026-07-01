import crypto from "crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.USE_LOCAL_STORE = "true";
});

import { getStore, initStore, flushNow } from "../persistence";
import {
  login,
  loginWithGoogle,
  listSessionsForUser,
  revokeSession,
  revokeOtherSessions,
  register,
  getUserFromRequestCookies,
  normalizeEmail,
} from "./authService";

function uidFromEmail(email: string): string {
  return crypto.createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

function cookieForToken(token: string): string {
  return `auth_token=${token}`;
}

describe("auth multi-session", () => {
  beforeAll(async () => {
    await initStore();
  });

  afterAll(async () => {
    await flushNow();
  });

  it("allows two concurrent sessions for the same user", () => {
    const email = `multi-${Date.now()}@test.local`;
    register({ email, password: "password12345" });
    const uid = uidFromEmail(email);
    const store = getStore();
    const users = store.users as Record<string, { emailVerified?: boolean }>;
    users[uid].emailVerified = true;

    const s1 = login({ email, password: "password12345", userAgent: "Chrome Windows" });
    if ("requiresTwoFactor" in s1) throw new Error("unexpected 2FA");
    const s2 = login({ email, password: "password12345", userAgent: "Safari iPhone" });
    if ("requiresTwoFactor" in s2) throw new Error("unexpected 2FA");

    expect(getUserFromRequestCookies(cookieForToken(s1.sessionToken))).not.toBeNull();
    expect(getUserFromRequestCookies(cookieForToken(s2.sessionToken))).not.toBeNull();

    const listed = listSessionsForUser(uid, s2.sessionToken);
    expect(listed).toHaveLength(2);
    expect(listed.filter((s) => s.current)).toHaveLength(1);
  });

  it("revokeSession removes another device only", () => {
    const email = `revoke-${Date.now()}@test.local`;
    register({ email, password: "password12345" });
    const uid = uidFromEmail(email);
    const users = (getStore().users ?? {}) as Record<string, { emailVerified?: boolean }>;
    users[uid].emailVerified = true;

    const s1 = login({ email, password: "password12345" });
    const s2 = login({ email, password: "password12345" });
    if ("requiresTwoFactor" in s1 || "requiresTwoFactor" in s2) throw new Error("unexpected 2FA");

    const other = listSessionsForUser(uid, s1.sessionToken).find((s) => !s.current)!;
    revokeSession(uid, other.id, s1.sessionToken);

    expect(getUserFromRequestCookies(cookieForToken(s1.sessionToken))).not.toBeNull();
    expect(getUserFromRequestCookies(cookieForToken(s2.sessionToken))).toBeNull();
  });

  it("revokeOtherSessions keeps current session", () => {
    const email = `others-${Date.now()}@test.local`;
    const r = loginWithGoogle({ email, firstName: "T", lastName: "U" }, { userAgent: "Firefox Linux" });
    if ("requiresTwoFactor" in r) throw new Error("unexpected 2FA");
    const uid = r.uid;
    const s2 = loginWithGoogle({ email, firstName: "T", lastName: "U" });
    if ("requiresTwoFactor" in s2) throw new Error("unexpected 2FA");

    const removed = revokeOtherSessions(uid, r.sessionToken);
    expect(removed).toBe(1);
    expect(getUserFromRequestCookies(cookieForToken(r.sessionToken))).not.toBeNull();
    expect(getUserFromRequestCookies(cookieForToken(s2.sessionToken))).toBeNull();
  });

  it("evicts oldest session when cap exceeded", () => {
    const email = `cap-${Date.now()}@test.local`;
    register({ email, password: "password12345" });
    const uid = uidFromEmail(email);
    const users = (getStore().users ?? {}) as Record<string, { emailVerified?: boolean }>;
    users[uid].emailVerified = true;

    const tokens: string[] = [];
    for (let i = 0; i < 11; i++) {
      const r = login({ email, password: "password12345", userAgent: `Device-${i}` });
      if ("requiresTwoFactor" in r) throw new Error("unexpected 2FA");
      tokens.push(r.sessionToken);
    }

    expect(listSessionsForUser(uid)).toHaveLength(10);
    expect(getUserFromRequestCookies(cookieForToken(tokens[0]))).toBeNull();
    expect(getUserFromRequestCookies(cookieForToken(tokens[10]))).not.toBeNull();
  });
});

describe("legacy session id migration", () => {
  it("assigns id when loading sessions without id", async () => {
    vi.resetModules();
    process.env.USE_LOCAL_STORE = "true";
    const persistence = await import("../persistence");
    await persistence.initStore();
    const email = `legacy-${Date.now()}@test.local`;
    const uid = uidFromEmail(email);
    const now = Date.now();
    persistence.getStore().users = {
      [uid]: {
        uid,
        email,
        firstName: "",
        lastName: "",
        passwordSaltB64: "x",
        passwordHashB64: "y",
        emailVerified: true,
        effortMinutes: { light: 15, medium: 30, heavy: 60 },
        billingPlan: "free",
      },
    };
    persistence.getStore().sessions = {
      legacytokenhex: {
        uid,
        createdAt: now - 1000,
        expiresAt: now + 7 * 24 * 60 * 60 * 1000,
      },
    };

    const auth = await import("./authService");
    const sessions = auth.listSessionsForUser(uid);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(auth.getUserFromRequestCookies("auth_token=legacytokenhex")).not.toBeNull();
  });
});
