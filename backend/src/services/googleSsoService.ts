import { createSsoLoginState } from "../utils/oauthState";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
const GOOGLE_SSO_REDIRECT_URI = process.env.GOOGLE_SSO_REDIRECT_URI
  ?? "http://localhost:3001/auth/google/callback";

const SSO_SCOPES = "openid email profile";

export function getGoogleSsoAuthUrl(loginHint?: string): { url: string; state: string } {
  const state = createSsoLoginState();

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_SSO_REDIRECT_URI,
    response_type: "code",
    scope: SSO_SCOPES,
    access_type: "online",
    state,
  });

  if (loginHint) {
    params.set("login_hint", loginHint);
  } else {
    params.set("prompt", "select_account");
  }

  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, state };
}

interface GoogleTokenResponse {
  access_token: string;
  id_token: string;
  token_type: string;
}

interface GoogleUserInfo {
  email: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  email_verified?: boolean;
}

export async function exchangeGoogleSsoCode(code: string): Promise<GoogleUserInfo> {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_SSO_REDIRECT_URI,
      grant_type: "authorization_code",
    }).toString(),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    console.error("[google-sso] Token exchange failed:", body);
    throw new Error("Google SSO token exchange failed");
  }

  const tokens = (await tokenRes.json()) as GoogleTokenResponse;

  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userInfoRes.ok) {
    throw new Error("Google SSO userinfo fetch failed");
  }

  const userInfo = (await userInfoRes.json()) as GoogleUserInfo;

  if (!userInfo.email) {
    throw new Error("Google account has no email");
  }

  return userInfo;
}
