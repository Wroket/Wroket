import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

describe("mondayOAuthService", () => {
  beforeEach(() => {
    process.env.MONDAY_CLIENT_ID = "test-client-id";
    process.env.MONDAY_CLIENT_SECRET = "test-secret";
    process.env.MONDAY_REDIRECT_URI = "http://localhost:3001/integrations/monday/callback";
    process.env.OAUTH_STATE_SECRET = "test-oauth-state-secret-32chars-min";
  });

  afterEach(() => {
    vi.resetModules();
    delete process.env.MONDAY_CLIENT_ID;
    delete process.env.MONDAY_CLIENT_SECRET;
    delete process.env.MONDAY_REDIRECT_URI;
    delete process.env.OAUTH_STATE_SECRET;
  });

  test("getMondayAuthorizeUrl requests boards:read and docs:read scopes", async () => {
    const { getMondayAuthorizeUrl } = await import("./mondayOAuthService");
    const url = new URL(getMondayAuthorizeUrl("uid-test"));
    expect(url.origin).toBe("https://auth.monday.com");
    expect(url.pathname).toBe("/oauth2/authorize");
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3001/integrations/monday/callback",
    );
    expect(url.searchParams.get("scope")).toBe("boards:read docs:read");
    expect(url.searchParams.get("state")).toBeTruthy();
  });
});
