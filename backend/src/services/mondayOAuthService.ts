/**
 * Monday.com OAuth — authorization URL + token exchange.
 */

import { createOAuthState } from "../utils/oauthState";
import { upsertConnection } from "./externalConnectionService";

const MONDAY_CLIENT_ID = process.env.MONDAY_CLIENT_ID ?? "";
const MONDAY_CLIENT_SECRET = process.env.MONDAY_CLIENT_SECRET ?? "";
const MONDAY_REDIRECT_URI = process.env.MONDAY_REDIRECT_URI
  ?? "http://localhost:3001/integrations/monday/callback";

/** Must match scopes enabled in Monday Developer Center → OAuth & Permissions (exact match). */
export const MONDAY_OAUTH_SCOPES = (
  process.env.MONDAY_OAUTH_SCOPES ?? "boards:read docs:read"
).trim();

function mondayAuthHeader(accessToken: string): string {
  const token = accessToken.trim();
  return token.toLowerCase().startsWith("bearer ") ? token : `Bearer ${token}`;
}

export function isMondayOAuthConfigured(): boolean {
  return MONDAY_CLIENT_ID.length > 0 && MONDAY_CLIENT_SECRET.length > 0;
}

export function getMondayAuthorizeUrl(uid: string, returnTo?: string): string {
  const state = createOAuthState(uid, returnTo);
  const params = new URLSearchParams({
    client_id: MONDAY_CLIENT_ID,
    redirect_uri: MONDAY_REDIRECT_URI,
    state,
  });
  if (MONDAY_OAUTH_SCOPES) params.set("scope", MONDAY_OAUTH_SCOPES);
  return `https://auth.monday.com/oauth2/authorize?${params.toString()}`;
}

interface MondayTokenResponse {
  access_token: string;
  token_type?: string;
  scope?: string;
}

interface MondayMeResponse {
  data?: {
    me?: {
      name?: string;
      account?: { id?: string; name?: string };
    };
  };
}

async function fetchMondayWorkspaceName(accessToken: string): Promise<{
  workspaceId: string | null;
  workspaceName: string | null;
}> {
  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      Authorization: mondayAuthHeader(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `query { me { name account { id name } } }`,
    }),
  });
  if (!res.ok) return { workspaceId: null, workspaceName: null };
  const json = (await res.json()) as MondayMeResponse;
  const account = json.data?.me?.account;
  return {
    workspaceId: account?.id ?? null,
    workspaceName: account?.name ?? json.data?.me?.name ?? null,
  };
}

export async function exchangeMondayOAuthCode(
  code: string,
  uid: string,
  email: string,
): Promise<{ workspaceName: string | null; connectionId: string }> {
  const body = new URLSearchParams({
    client_id: MONDAY_CLIENT_ID,
    client_secret: MONDAY_CLIENT_SECRET,
    code,
    redirect_uri: MONDAY_REDIRECT_URI,
    grant_type: "authorization_code",
  });

  const tokenRes = await fetch("https://auth.monday.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text();
    console.error("[monday-oauth] Token exchange failed:", errBody);
    throw new Error("Monday OAuth token exchange failed");
  }

  const tokens = (await tokenRes.json()) as MondayTokenResponse;
  if (!tokens.scope?.includes("boards:read")) {
    console.warn(
      "[monday-oauth] Token granted without boards:read — enable scope in Monday Dev Center and reconnect",
      { scope: tokens.scope ?? "(empty)" },
    );
  }
  if (!tokens.scope?.includes("docs:read")) {
    console.warn(
      "[monday-oauth] Token granted without docs:read — Monday Docs import will fail until scope is enabled and user reconnects",
      { scope: tokens.scope ?? "(empty)" },
    );
  }
  const { workspaceId, workspaceName } = await fetchMondayWorkspaceName(tokens.access_token);

  const conn = upsertConnection({
    provider: "monday",
    ownerUid: uid,
    ownerEmail: email,
    accessToken: tokens.access_token,
    workspaceId: workspaceId ?? undefined,
    workspaceName: workspaceName ?? undefined,
    grantedScopes: tokens.scope?.trim() || undefined,
  });

  return {
    workspaceName: workspaceName ?? null,
    connectionId: conn.id,
  };
}
