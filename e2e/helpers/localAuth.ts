import fs from "fs";

import type { APIRequestContext } from "@playwright/test";

import { apiBase, localStorePath } from "./apiBase";

const DEFAULT_PASSWORD = "E2eTestPass123!";

interface StoredUserRow {
  email?: string;
  emailVerifyToken?: string;
}

async function waitForVerifyToken(email: string, timeoutMs = 5000): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(localStorePath)) {
      const store = JSON.parse(fs.readFileSync(localStorePath, "utf-8")) as { users?: Record<string, StoredUserRow> };
      const users = store.users ?? {};
      for (const row of Object.values(users)) {
        if (row.email?.trim().toLowerCase() === normalized && row.emailVerifyToken) {
          return row.emailVerifyToken;
        }
      }
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`emailVerifyToken not found in ${localStorePath} for ${email}`);
}

/**
 * Register + verify + login on the same Playwright APIRequestContext (cookies kept).
 * Requires USE_LOCAL_STORE=true so the verify token can be read from local-store.json.
 */
export async function createVerifiedUser(
  request: APIRequestContext,
  opts?: { email?: string; password?: string },
): Promise<{ email: string; password: string }> {
  const email = opts?.email ?? `e2e-reliability-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@wroket.local`;
  const password = opts?.password ?? DEFAULT_PASSWORD;

  const registerRes = await request.post(`${apiBase}/auth/register`, {
    data: { email, password, timezone: "Europe/Paris" },
  });
  if (registerRes.status() !== 201) {
    const body = await registerRes.text();
    throw new Error(`register failed (${registerRes.status()}): ${body}`);
  }

  const verifyToken = await waitForVerifyToken(email);
  const verifyRes = await request.post(`${apiBase}/auth/verify-email`, {
    data: { token: verifyToken },
  });
  if (!verifyRes.ok()) {
    const body = await verifyRes.text();
    throw new Error(`verify-email failed (${verifyRes.status()}): ${body}`);
  }

  const loginRes = await request.post(`${apiBase}/auth/login`, {
    data: { email, password, timezone: "Europe/Paris" },
  });
  if (!loginRes.ok()) {
    const body = await loginRes.text();
    throw new Error(`login failed (${loginRes.status()}): ${body}`);
  }

  return { email, password };
}
