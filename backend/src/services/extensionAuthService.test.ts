import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const pathMod = require("path") as typeof import("path");
  const osMod = require("os") as typeof import("os");
  process.env.USE_LOCAL_STORE = "true";
  process.env.LOCAL_STORE_PATH = pathMod.join(
    osMod.tmpdir(),
    `wroket-ext-auth-test-${process.pid}.json`,
  );
  process.env.OAUTH_STATE_SECRET = "test-oauth-state-secret-for-ext";
});

const storePath =
  process.env.LOCAL_STORE_PATH ||
  path.join(os.tmpdir(), `wroket-ext-auth-fallback-${process.pid}.json`);

import { initStore } from "../persistence";
import { register } from "./authService";
import {
  createExtensionAuthCode,
  exchangeExtensionAuthCode,
  isAllowedExtensionRedirectUri,
} from "./extensionAuthService";

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier, "utf8").digest("base64url");
  return { verifier, challenge };
}

describe("extensionAuthService", () => {
  beforeAll(async () => {
    fs.writeFileSync(storePath, "{}", "utf-8");
    await initStore();
  });

  it("accepts only chromiumapp.org HTTPS redirects", () => {
    expect(
      isAllowedExtensionRedirectUri("https://abcdefghijklmnopqrstuvwxyz.chromiumapp.org/"),
    ).toBe(true);
    expect(isAllowedExtensionRedirectUri("https://evil.com/")).toBe(false);
    expect(isAllowedExtensionRedirectUri("http://abc.chromiumapp.org/")).toBe(false);
  });

  it("exchanges PKCE code for extension key once", () => {
    const { uid } = register({
      email: `ext-${crypto.randomUUID().slice(0, 8)}@test.local`,
      password: "password123",
    });
    const { verifier, challenge } = pkcePair();
    const redirectUri = "https://abcdefghijklmnopqrstuvwxyzabcdef.chromiumapp.org/";
    const code = createExtensionAuthCode({
      uid,
      codeChallenge: challenge,
      redirectUri,
      browserName: "Test Chrome",
    });
    const key = exchangeExtensionAuthCode({ code, codeVerifier: verifier, redirectUri });
    expect(key.key.startsWith("wrk_live_")).toBe(true);
    expect(key.kind).toBe("extension");
    expect(key.scopes).toContain("todos:write");
    expect(() =>
      exchangeExtensionAuthCode({ code, codeVerifier: verifier, redirectUri }),
    ).toThrow();
  });
});
