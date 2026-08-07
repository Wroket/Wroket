/**
 * Microsoft Teams bot + Entra admin-consent OAuth (Teams+).
 * Uses TEAMS_BOT_* with fallback to MICROSOFT_BOT_* / MICROSOFT_CLIENT_*.
 */

import { createOAuthState } from "../utils/oauthState";
import { upsertTeamsConnection } from "./teamsConnectionService";

function teamsBotAppId(): string {
  return (
    process.env.TEAMS_BOT_APP_ID?.trim() ||
    process.env.MICROSOFT_BOT_APP_ID?.trim() ||
    process.env.MICROSOFT_CLIENT_ID?.trim() ||
    ""
  );
}

function teamsBotAppPassword(): string {
  return (
    process.env.TEAMS_BOT_APP_PASSWORD?.trim() ||
    process.env.MICROSOFT_BOT_APP_PASSWORD?.trim() ||
    process.env.MICROSOFT_CLIENT_SECRET?.trim() ||
    ""
  );
}

const TEAMS_REDIRECT_URI =
  process.env.TEAMS_REDIRECT_URI ??
  process.env.TEAMS_BOT_REDIRECT_URI ??
  "http://localhost:3001/integrations/teams/callback";

const TENANT =
  process.env.TEAMS_BOT_TENANT_ID?.trim() ||
  process.env.MICROSOFT_TENANT_ID?.trim() ||
  "common";

export function isTeamsBotConfigured(): boolean {
  return teamsBotAppId().length > 0 && teamsBotAppPassword().length > 0;
}

export function getTeamsBotCredentials(): { appId: string; appPassword: string } {
  return { appId: teamsBotAppId(), appPassword: teamsBotAppPassword() };
}

/**
 * Admin consent URL — installs the multi-tenant bot app into the user's tenant.
 */
export function getTeamsAuthorizeUrl(uid: string, returnTo?: string): string {
  const state = createOAuthState(uid, returnTo);
  const params = new URLSearchParams({
    client_id: teamsBotAppId(),
    response_type: "code",
    redirect_uri: TEAMS_REDIRECT_URI,
    response_mode: "query",
    scope: "openid profile email offline_access User.Read",
    state,
  });
  return `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize?${params.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function exchangeTeamsOAuthCode(
  code: string,
  uid: string,
  email: string,
): Promise<{ tenantName: string }> {
  const body = new URLSearchParams({
    client_id: teamsBotAppId(),
    client_secret: teamsBotAppPassword(),
    code,
    redirect_uri: TEAMS_REDIRECT_URI,
    grant_type: "authorization_code",
    scope: "openid profile email offline_access User.Read",
  });

  const tokenRes = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const tokens = (await tokenRes.json()) as TokenResponse;
  if (!tokens.access_token) {
    console.error("[teams-oauth] Token exchange failed:", tokens.error_description ?? tokens.error);
    throw new Error("Teams OAuth token exchange failed");
  }

  const idPayload = tokens.id_token ? decodeJwtPayload(tokens.id_token) : null;
  const accessPayload = decodeJwtPayload(tokens.access_token);
  const tenantId =
    (typeof idPayload?.tid === "string" && idPayload.tid) ||
    (typeof accessPayload?.tid === "string" && accessPayload.tid) ||
    "unknown";
  const tenantName =
    (typeof idPayload?.preferred_username === "string" && idPayload.preferred_username) ||
    email;

  // Capture AAD email for identity checks (may differ from Wroket email — still store tid).
  let graphEmail = email;
  try {
    const me = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (me.ok) {
      const data = (await me.json()) as { mail?: string; userPrincipalName?: string };
      graphEmail = data.mail?.trim() || data.userPrincipalName?.trim() || email;
    }
  } catch (err) {
    console.warn("[teams-oauth] Graph /me failed:", err);
  }

  upsertTeamsConnection({
    ownerUid: uid,
    ownerEmail: graphEmail,
    tenantId,
    tenantName: String(tenantName),
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
  });

  return { tenantName: String(tenantName) };
}

/** Client-credentials token for Bot Framework Connector. */
export async function getTeamsBotConnectorToken(): Promise<string | null> {
  if (!isTeamsBotConfigured()) return null;
  const { appId, appPassword } = getTeamsBotCredentials();
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: appId,
    client_secret: appPassword,
    scope: "https://api.botframework.com/.default",
  });
  const res = await fetch("https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(8_000),
  });
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!data.access_token) {
    console.warn("[teams-bot] connector token failed:", data.error ?? res.status);
    return null;
  }
  return data.access_token;
}
