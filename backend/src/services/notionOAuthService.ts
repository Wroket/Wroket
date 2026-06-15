/**
 * Notion public OAuth — authorization URL + token exchange.
 * Tokens do not expire; no refresh flow required.
 */

import { createOAuthState } from "../utils/oauthState";
import { upsertConnection } from "./externalConnectionService";

const NOTION_CLIENT_ID = process.env.NOTION_CLIENT_ID ?? "";
const NOTION_CLIENT_SECRET = process.env.NOTION_CLIENT_SECRET ?? "";
const NOTION_REDIRECT_URI = process.env.NOTION_REDIRECT_URI
  ?? "http://localhost:3001/integrations/notion/callback";

export function isNotionOAuthConfigured(): boolean {
  return NOTION_CLIENT_ID.length > 0 && NOTION_CLIENT_SECRET.length > 0;
}

export function getNotionAuthorizeUrl(uid: string, returnTo?: string): string {
  const state = createOAuthState(uid, returnTo);
  const params = new URLSearchParams({
    client_id: NOTION_CLIENT_ID,
    redirect_uri: NOTION_REDIRECT_URI,
    response_type: "code",
    owner: "user",
    state,
  });
  return `https://api.notion.com/v1/oauth/authorize?${params.toString()}`;
}

interface NotionTokenResponse {
  access_token: string;
  token_type: string;
  bot_id: string;
  workspace_name?: string;
  workspace_id?: string;
  workspace_icon?: string | null;
  owner?: { type: string; user?: { id?: string } };
}

export async function exchangeNotionOAuthCode(
  code: string,
  uid: string,
  email: string,
): Promise<{ workspaceName: string | null; connectionId: string }> {
  const basic = Buffer.from(`${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`).toString("base64");
  const tokenRes = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: NOTION_REDIRECT_URI,
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    console.error("[notion-oauth] Token exchange failed:", body);
    throw new Error("Notion OAuth token exchange failed");
  }

  const tokens = (await tokenRes.json()) as NotionTokenResponse;
  const conn = upsertConnection({
    provider: "notion",
    ownerUid: uid,
    ownerEmail: email,
    accessToken: tokens.access_token,
    workspaceId: tokens.workspace_id,
    workspaceName: tokens.workspace_name,
    botId: tokens.bot_id,
  });

  return {
    workspaceName: tokens.workspace_name ?? null,
    connectionId: conn.id,
  };
}
