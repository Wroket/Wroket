/**
 * Slack Web API helpers — outbound chat + inbound identity (Lot 2–3).
 */

import { ValidationError } from "../utils/errors";
import { getSlackBotTokenForTeam, getSlackConnectionForUser } from "./slackConnectionService";

interface SlackApiOk {
  ok: boolean;
  error?: string;
}

/**
 * Posts Block Kit / attachments payload to the user's connected Slack channel.
 * Returns true if sent via OAuth; false if no usable connection (caller may fall back to Incoming Webhook).
 */
export async function tryPostViaSlackOAuth(uid: string, body: unknown): Promise<boolean> {
  const conn = getSlackConnectionForUser(uid);
  if (!conn?.accessToken || !conn.channelId) return false;

  const payload = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${conn.accessToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel: conn.channelId,
      text: typeof payload.text === "string" ? payload.text : "Notification Wroket",
      blocks: payload.blocks,
      attachments: payload.attachments,
      unfurl_links: false,
    }),
    signal: AbortSignal.timeout(5_000),
  });

  const data = (await res.json()) as SlackApiOk;
  if (!data.ok) {
    if (data.error === "not_in_channel") {
      throw new ValidationError(
        "Le bot Wroket n’est pas dans le canal Slack. Ouvrez le canal et tapez /invite @Wroket.",
        "SLACK_NOT_IN_CHANNEL",
      );
    }
    throw new Error(data.error ?? `slack chat.postMessage HTTP ${res.status}`);
  }
  return true;
}

/**
 * Send a simple test message to the connected channel.
 * Prefers chat.postMessage; on `not_in_channel`, falls back to the OAuth Incoming Webhook URL.
 */
export async function postSlackTestMessage(uid: string): Promise<void> {
  const conn = getSlackConnectionForUser(uid);
  if (!conn?.accessToken || !conn.channelId) {
    throw new ValidationError(
      "Slack non connecté ou canal manquant — reconnectez Slack dans Paramètres.",
      "SLACK_NOT_CONNECTED",
    );
  }

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${conn.accessToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel: conn.channelId,
      text: "Test Wroket — connexion Slack OK ✅",
    }),
    signal: AbortSignal.timeout(5_000),
  });
  const data = (await res.json()) as SlackApiOk;
  if (data.ok) return;

  if (data.error === "not_in_channel" && conn.incomingWebhookUrl) {
    const wh = await fetch(conn.incomingWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        text: "Test Wroket — connexion Slack OK ✅ (via webhook ; invitez @Wroket dans le canal pour les messages API / boutons)",
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (wh.ok) return;
  }

  if (data.error === "not_in_channel") {
    throw new ValidationError(
      `Le bot Wroket n’est pas dans #${(conn.channelName ?? "canal").replace(/^#/, "")}. Dans Slack, ouvrez le canal et tapez /invite @Wroket, puis réessayez.`,
      "SLACK_NOT_IN_CHANNEL",
    );
  }

  throw new ValidationError(
    `Échec du test Slack (${data.error ?? `HTTP ${res.status}`}).`,
    "SLACK_TEST_FAILED",
  );
}

/**
 * Resolve a Slack user's email via users.info (requires users:read.email).
 */
export async function fetchSlackUserEmail(
  accessToken: string,
  slackUserId: string,
): Promise<string | null> {
  const params = new URLSearchParams({ user: slackUserId });
  const res = await fetch(`https://slack.com/api/users.info?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(5_000),
  });
  const data = (await res.json()) as {
    ok: boolean;
    error?: string;
    user?: { profile?: { email?: string }; is_bot?: boolean; is_stranger?: boolean };
  };
  if (!data.ok) {
    console.warn("[slack] users.info failed: %s", data.error ?? res.status);
    return null;
  }
  const email = data.user?.profile?.email?.trim();
  return email && email.includes("@") ? email : null;
}

/**
 * Bot token for a workspace team id (any connected Wroket user who installed the app).
 */
export function resolveBotTokenForTeam(teamId: string): string | null {
  return getSlackBotTokenForTeam(teamId);
}

/**
 * Post an ephemeral message to a user in a channel.
 */
export async function postSlackEphemeral(opts: {
  accessToken: string;
  channelId: string;
  slackUserId: string;
  text: string;
}): Promise<void> {
  const res = await fetch("https://slack.com/api/chat.postEphemeral", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel: opts.channelId,
      user: opts.slackUserId,
      text: opts.text,
    }),
    signal: AbortSignal.timeout(5_000),
  });
  const data = (await res.json()) as SlackApiOk;
  if (!data.ok) {
    console.warn("[slack] chat.postEphemeral failed: %s", data.error ?? res.status);
  }
}

/**
 * Replace message blocks via response_url (interaction acknowledgment).
 */
export async function postSlackResponseUrl(
  responseUrl: string,
  body: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch(responseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (err) {
    console.warn("[slack] response_url post failed: %s", (err as Error).message ?? err);
  }
}

/**
 * Revoke the bot token (best-effort).
 */
export async function revokeSlackToken(accessToken: string): Promise<void> {
  try {
    await fetch("https://slack.com/api/auth.revoke", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ token: accessToken }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (err) {
    console.warn("[slack] auth.revoke failed: %s", (err as Error).message ?? err);
  }
}
