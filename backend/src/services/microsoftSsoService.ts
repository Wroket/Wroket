import { createSsoLoginState } from "../utils/oauthState";

const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID ?? "";
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET ?? "";

/** Azure shows both "Secret ID" (UUID) and one-time "Value" — only Value works for OAuth. */
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const secretTrim = MICROSOFT_CLIENT_SECRET.trim();
if (secretTrim && UUID_LIKE.test(secretTrim)) {
  console.warn(
    "[microsoft-sso] MICROSOFT_CLIENT_SECRET looks like an Azure Secret ID (UUID). Paste the secret Value from Certificates & secrets, not the ID column.",
  );
}
const MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID?.trim() || "common";
const MICROSOFT_SSO_REDIRECT_URI = process.env.MICROSOFT_SSO_REDIRECT_URI
  ?? "http://localhost:3001/auth/microsoft/callback";

/** Delegated scopes: OpenID + Graph profile for email / name */
const SSO_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "https://graph.microsoft.com/User.Read",
].join(" ");

function authorityHost(): string {
  return `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}`;
}

export function isMicrosoftSsoConfigured(): boolean {
  return Boolean(MICROSOFT_CLIENT_ID.trim() && MICROSOFT_CLIENT_SECRET.trim());
}

export function getMicrosoftSsoAuthUrl(loginHint?: string): { url: string; state: string } {
  if (!MICROSOFT_CLIENT_ID.trim()) {
    throw new Error("Microsoft SSO is not configured (MICROSOFT_CLIENT_ID)");
  }

  const state = createSsoLoginState();
  const params = new URLSearchParams({
    client_id: MICROSOFT_CLIENT_ID.trim(),
    redirect_uri: MICROSOFT_SSO_REDIRECT_URI,
    response_type: "code",
    scope: SSO_SCOPES,
    response_mode: "query",
    state,
    prompt: "select_account",
  });

  if (loginHint) {
    params.set("login_hint", loginHint);
  }

  return { url: `${authorityHost()}/oauth2/v2.0/authorize?${params.toString()}`, state };
}

interface MicrosoftTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
  refresh_token?: string;
  id_token?: string;
}

interface GraphMe {
  mail?: string | null;
  userPrincipalName?: string;
  displayName?: string;
  givenName?: string | null;
  surname?: string | null;
}

export interface MicrosoftUserInfo {
  email: string;
  firstName: string;
  lastName: string;
}

export async function exchangeMicrosoftSsoCode(code: string): Promise<MicrosoftUserInfo> {
  if (!MICROSOFT_CLIENT_ID.trim() || !MICROSOFT_CLIENT_SECRET.trim()) {
    throw new Error("Microsoft SSO client credentials missing");
  }

  // Do not send `scope` here: Microsoft issues tokens for the scopes consented at authorize time.
  // Including scope in the token request sometimes causes invalid_grant / scope errors (esp. MSA).
  const tokenRes = await fetch(`${authorityHost()}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID.trim(),
      client_secret: MICROSOFT_CLIENT_SECRET.trim(),
      code,
      redirect_uri: MICROSOFT_SSO_REDIRECT_URI,
      grant_type: "authorization_code",
    }).toString(),
  });

  const tokenText = await tokenRes.text();
  let tokenJson: unknown;
  try {
    tokenJson = JSON.parse(tokenText) as Record<string, unknown>;
  } catch {
    tokenJson = {};
  }
  const errBody = tokenJson as { error?: string; error_description?: string; access_token?: string };

  if (!tokenRes.ok || errBody.error) {
    const detail = errBody.error_description ?? errBody.error ?? tokenText.slice(0, 500);
    console.error("[microsoft-sso] Token exchange failed:", tokenRes.status, detail);
    throw new Error("Microsoft SSO token exchange failed");
  }

  const tokens = tokenJson as MicrosoftTokenResponse;
  if (!tokens.access_token) {
    console.error("[microsoft-sso] Token response missing access_token:", tokenText.slice(0, 300));
    throw new Error("Microsoft SSO token exchange failed");
  }

  const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!meRes.ok) {
    const body = await meRes.text();
    console.error("[microsoft-sso] Graph /me failed:", body);
    throw new Error("Microsoft Graph userinfo fetch failed");
  }

  const me = (await meRes.json()) as GraphMe;

  const rawEmail = (me.mail && me.mail.includes("@") ? me.mail : me.userPrincipalName) ?? "";
  const email = rawEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new Error("Microsoft account has no usable email");
  }

  let firstName = (me.givenName ?? "").trim();
  let lastName = (me.surname ?? "").trim();
  if (!firstName && !lastName && me.displayName) {
    const parts = me.displayName.trim().split(/\s+/);
    firstName = parts[0] ?? "";
    lastName = parts.slice(1).join(" ") || "";
  }

  return { email, firstName, lastName };
}
