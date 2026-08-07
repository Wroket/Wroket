/**
 * Teams Bot Connector + webhook fallback helpers.
 */

import { ValidationError } from "../utils/errors";
import { getTeamsConnectionForUser } from "./teamsConnectionService";
import { getTeamsBotConnectorToken, isTeamsBotConfigured } from "./teamsOAuthService";

/**
 * Post an Adaptive Card / activity to the user's stored conversation via Bot Connector.
 */
export async function tryPostViaTeamsBot(uid: string, cardOrText: unknown): Promise<boolean> {
  const conn = getTeamsConnectionForUser(uid);
  if (!conn?.conversationId || !conn.serviceUrl) return false;
  const token = await getTeamsBotConnectorToken();
  if (!token) return false;

  const base = conn.serviceUrl.replace(/\/$/, "");
  const activity =
    typeof cardOrText === "string"
      ? { type: "message", text: cardOrText }
      : cardOrText;

  const res = await fetch(`${base}/v3/conversations/${encodeURIComponent(conn.conversationId)}/activities`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(activity),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) {
    console.warn("[teams] proactive post failed:", res.status, await res.text().catch(() => ""));
    return false;
  }
  return true;
}

export async function postTeamsTestMessage(uid: string): Promise<void> {
  const conn = getTeamsConnectionForUser(uid);
  if (!conn) {
    throw new ValidationError("Teams n'est pas connecté", "TEAMS_NOT_CONNECTED");
  }

  const text = "Test Wroket — connexion Microsoft Teams OK ✅";
  if (conn.conversationId && conn.serviceUrl && isTeamsBotConfigured()) {
    const ok = await tryPostViaTeamsBot(uid, { type: "message", text });
    if (ok) return;
  }

  if (conn.incomingWebhookUrl) {
    const wh = await fetch(conn.incomingWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5_000),
    });
    if (wh.ok) return;
  }

  throw new ValidationError(
    "Impossible d’envoyer le test Teams. Ajoutez le bot dans un canal (ou un Incoming Webhook) puis réessayez.",
    "TEAMS_TEST_FAILED",
  );
}

/**
 * Resolve AAD user email from Graph using a delegated token on the connection, if present.
 */
export async function fetchTeamsUserEmailFromGraph(
  accessToken: string,
): Promise<string | null> {
  try {
    const me = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!me.ok) return null;
    const data = (await me.json()) as { mail?: string; userPrincipalName?: string };
    const email = data.mail?.trim() || data.userPrincipalName?.trim();
    return email && email.includes("@") ? email : null;
  } catch {
    return null;
  }
}
