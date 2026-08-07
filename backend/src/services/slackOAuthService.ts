/**
 * Slack OAuth v2 — authorize URL + token exchange (app A0ASUUQ8DQE).
 */

import { createOAuthState } from "../utils/oauthState";
import { upsertSlackConnection } from "./slackConnectionService";

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID ?? "";
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET ?? "";
const SLACK_REDIRECT_URI =
  process.env.SLACK_REDIRECT_URI ?? "http://localhost:3001/integrations/slack/callback";

/** Bot scopes Lot 2–3 (chat + channel pick + user email for interactivity). */
export const SLACK_BOT_SCOPES = [
  "chat:write",
  "channels:read",
  "groups:read",
  "incoming-webhook",
  "users:read",
  "users:read.email",
].join(",");

export function isSlackOAuthConfigured(): boolean {
  return SLACK_CLIENT_ID.length > 0 && SLACK_CLIENT_SECRET.length > 0;
}

export function getSlackAuthorizeUrl(uid: string, returnTo?: string): string {
  const state = createOAuthState(uid, returnTo);
  const params = new URLSearchParams({
    client_id: SLACK_CLIENT_ID,
    scope: SLACK_BOT_SCOPES,
    redirect_uri: SLACK_REDIRECT_URI,
    state,
  });
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

interface SlackOAuthV2Response {
  ok: boolean;
  error?: string;
  access_token?: string;
  token_type?: string;
  scope?: string;
  bot_user_id?: string;
  team?: { id?: string; name?: string };
  incoming_webhook?: {
    channel?: string;
    channel_id?: string;
    configuration_url?: string;
    url?: string;
  };
}

export async function exchangeSlackOAuthCode(
  code: string,
  uid: string,
  email: string,
): Promise<{ teamName: string; channelName: string | null }> {
  const body = new URLSearchParams({
    client_id: SLACK_CLIENT_ID,
    client_secret: SLACK_CLIENT_SECRET,
    code,
    redirect_uri: SLACK_REDIRECT_URI,
  });

  const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const tokens = (await tokenRes.json()) as SlackOAuthV2Response;
  if (!tokens.ok || !tokens.access_token) {
    console.error("[slack-oauth] Token exchange failed:", tokens.error ?? await tokenRes.text().catch(() => ""));
    throw new Error("Slack OAuth token exchange failed");
  }

  const teamId = tokens.team?.id ?? "";
  const teamName = tokens.team?.name ?? "Slack";
  if (!teamId) {
    throw new Error("Slack OAuth response missing team id");
  }

  upsertSlackConnection({
    ownerUid: uid,
    ownerEmail: email,
    accessToken: tokens.access_token,
    teamId,
    teamName,
    channelId: tokens.incoming_webhook?.channel_id,
    channelName: tokens.incoming_webhook?.channel,
    incomingWebhookUrl: tokens.incoming_webhook?.url,
    botUserId: tokens.bot_user_id,
  });

  return {
    teamName,
    channelName: tokens.incoming_webhook?.channel ?? null,
  };
}
