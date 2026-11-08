/**
 * Teams Bot Connector + webhook fallback helpers.
 */

import { ValidationError } from "../utils/errors";
import { getTeamsConnectionForUser } from "./teamsConnectionService";
import {
  getTeamsBotConnectorToken,
  getTeamsBotCredentials,
  isTeamsBotConfigured,
} from "./teamsOAuthService";

type ChannelAccount = { id?: string; name?: string; role?: string; aadObjectId?: string };

function channelAccountId(account: unknown): string | undefined {
  if (!account || typeof account !== "object") return undefined;
  const id = (account as ChannelAccount).id;
  return typeof id === "string" && id.trim() ? id.trim() : undefined;
}

/**
 * Decode JWT payload claims needed for connector diagnostics (no signature check).
 */
function peekTokenBotClaims(token: string): { appid?: string; azp?: string; tid?: string } {
  try {
    const part = token.split(".")[1];
    if (!part) return {};
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const payload = JSON.parse(json) as Record<string, unknown>;
    return {
      appid: typeof payload.appid === "string" ? payload.appid : undefined,
      azp: typeof payload.azp === "string" ? payload.azp : undefined,
      tid: typeof payload.tid === "string" ? payload.tid : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Bot Framework Connector requires `Activity.From` (MissingProperty 400 without it).
 * Critical: `from` must be the inbound activity's `recipient` (channel bot account),
 * NOT the raw Microsoft App ID — mismatched channel ids yield 403 BadArgument
 * "token is not valid for the bot specified in the from field" even when JWT appid matches.
 * @see https://learn.microsoft.com/answers/questions/5887178
 */
function withBotFrom(activity: unknown, preferredFrom?: ChannelAccount): Record<string, unknown> {
  const { appId } = getTeamsBotCredentials();
  const base: Record<string, unknown> =
    activity && typeof activity === "object"
      ? { ...(activity as Record<string, unknown>) }
      : { type: "message" };

  const existingId = channelAccountId(base.from);
  if (existingId) return base;

  const preferredId = preferredFrom?.id?.trim();
  if (preferredId) {
    base.from = {
      id: preferredId,
      name: preferredFrom?.name || "Wroket",
      role: "bot",
    };
    return base;
  }

  // Proactive / no inbound recipient: last resort App ID (Teams often uses 28:<appId>).
  if (appId) {
    base.from = { id: `28:${appId}`, name: "Wroket", role: "bot" };
  }
  return base;
}

/**
 * Reply (or proactive post) to a Bot Framework conversation via Connector API.
 * Prefer this over returning a message body in the HTTP webhook response.
 */
export async function postTeamsConversationActivity(opts: {
  serviceUrl: string;
  conversationId: string;
  activity: unknown;
  /** When set, POST …/activities/{replyToId} (Reply to Activity). */
  replyToId?: string;
  preferredFrom?: ChannelAccount;
}): Promise<boolean> {
  const base = opts.serviceUrl.replace(/\/$/, "");
  if (!base || !opts.conversationId) return false;

  const bodyObj = withBotFrom(opts.activity, opts.preferredFrom);
  const pathActivity = opts.replyToId
    ? `${base}/v3/conversations/${encodeURIComponent(opts.conversationId)}/activities/${encodeURIComponent(opts.replyToId)}`
    : `${base}/v3/conversations/${encodeURIComponent(opts.conversationId)}/activities`;
  const payload = JSON.stringify(bodyObj);

  /**
   * SingleTenant Azure Bot + Multitenant Entra app: primary token uses home tenant;
   * on from/token 403, retry once with botframework.com (same App ID).
   */
  const authorities: Array<string | undefined> = [undefined, "botframework.com"];
  let lastErr = "";
  for (const authority of authorities) {
    const token = await getTeamsBotConnectorToken(authority);
    if (!token) continue;

    const res = await fetch(pathActivity, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: payload,
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      if (authority) {
        console.warn(`[teams] connector post OK after authority fallback=${authority}`);
      }
      return true;
    }

    const errBody = await res.text().catch(() => "");
    const claims = peekTokenBotClaims(token);
    const fromId = channelAccountId(bodyObj.from) ?? "";
    lastErr = `${res.status} ${errBody} | from=${fromId} tokenAppid=${claims.appid ?? "?"} tokenAzp=${claims.azp ?? "?"} tid=${claims.tid ?? "?"} auth=${authority ?? "home"} replyPath=${Boolean(opts.replyToId)}`;
    console.warn(`[teams] connector post failed: ${lastErr}`);

    // Retry alternate authority on auth / from-identity failures only.
    if (res.status !== 401 && res.status !== 403) break;
  }
  return false;
}

/**
 * Send a text reply to the inbound activity's conversation (Web Chat + Teams).
 * Shapes the Activity per Bot Connector docs: from←recipient, recipient←from.
 */
export async function replyTeamsText(opts: {
  serviceUrl?: string;
  conversationId?: string;
  replyToId?: string;
  text: string;
  /** Inbound activity.from (user) → outbound recipient */
  inboundFrom?: ChannelAccount;
  /** Inbound activity.recipient (bot) → outbound from */
  inboundRecipient?: ChannelAccount;
  /** Inbound conversation object */
  conversation?: Record<string, unknown>;
}): Promise<boolean> {
  if (!opts.serviceUrl || !opts.conversationId || !opts.text.trim()) return false;
  const activity: Record<string, unknown> = {
    type: "message",
    text: opts.text,
  };
  if (opts.replyToId) activity.replyToId = opts.replyToId;
  if (opts.conversation) activity.conversation = opts.conversation;
  else activity.conversation = { id: opts.conversationId };
  if (opts.inboundFrom) activity.recipient = opts.inboundFrom;
  return postTeamsConversationActivity({
    serviceUrl: opts.serviceUrl,
    conversationId: opts.conversationId,
    activity,
    replyToId: opts.replyToId,
    preferredFrom: opts.inboundRecipient,
  });
}

/**
 * Update an existing Teams activity in place (e.g. replace Adaptive Card buttons after click).
 */
export async function updateTeamsConversationActivity(opts: {
  serviceUrl?: string;
  conversationId?: string;
  activityId?: string;
  activity: unknown;
}): Promise<boolean> {
  if (!opts.serviceUrl || !opts.conversationId || !opts.activityId) return false;
  const token = await getTeamsBotConnectorToken();
  if (!token) return false;
  const base = opts.serviceUrl.replace(/\/$/, "");
  const bodyObj = withBotFrom(opts.activity);
  const res = await fetch(
    `${base}/v3/conversations/${encodeURIComponent(opts.conversationId)}/activities/${encodeURIComponent(opts.activityId)}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bodyObj),
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    const claims = peekTokenBotClaims(token);
    const fromId = channelAccountId(bodyObj.from) ?? "";
    console.warn(
      `[teams] connector update activity failed: ${res.status} ${errBody} | from=${fromId} tokenAppid=${claims.appid ?? "?"}`,
    );
    return false;
  }
  return true;
}

/**
 * Post an Adaptive Card / activity to the user's stored conversation via Bot Connector.
 */
export async function tryPostViaTeamsBot(uid: string, cardOrText: unknown): Promise<boolean> {
  const conn = getTeamsConnectionForUser(uid);
  if (!conn?.conversationId || !conn.serviceUrl) return false;

  const activity =
    typeof cardOrText === "string"
      ? { type: "message", text: cardOrText }
      : cardOrText;

  return postTeamsConversationActivity({
    serviceUrl: conn.serviceUrl,
    conversationId: conn.conversationId,
    activity,
  });
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
