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

export interface SlackChannelOption {
  id: string;
  name: string;
  isPrivate?: boolean;
}

/**
 * List public (and private if scope granted) channels in the connected Slack workspace.
 */
export async function listSlackChannelsForUser(uid: string): Promise<SlackChannelOption[]> {
  const conn = getSlackConnectionForUser(uid);
  if (!conn?.accessToken) {
    throw new ValidationError("Slack n'est pas connecté", "SLACK_NOT_CONNECTED");
  }

  const fetchWithTypes = async (types: string) => {
    const params = new URLSearchParams({
      types,
      exclude_archived: "true",
      limit: "200",
    });
    const res = await fetch(`https://slack.com/api/conversations.list?${params.toString()}`, {
      headers: { Authorization: `Bearer ${conn.accessToken}` },
      signal: AbortSignal.timeout(6_000),
    });
    return (await res.json()) as {
      ok: boolean;
      error?: string;
      channels?: Array<{ id?: string; name?: string; is_private?: boolean }>;
    };
  };

  let data = await fetchWithTypes("public_channel,private_channel");
  if (!data.ok && data.error === "missing_scope") {
    data = await fetchWithTypes("public_channel");
  }
  if (!data.ok) {
    throw new ValidationError(
      `Impossible de lister les canaux Slack (${data.error ?? "erreur API"}).`,
      "SLACK_CHANNELS_LIST_FAILED",
    );
  }

  const list: SlackChannelOption[] = [];
  for (const ch of data.channels ?? []) {
    if (ch.id && ch.name) {
      list.push({ id: ch.id, name: ch.name, isPrivate: Boolean(ch.is_private) });
    }
  }
  if (
    conn.channelId &&
    conn.channelName &&
    !list.some((c) => c.id === conn.channelId)
  ) {
    list.unshift({
      id: conn.channelId,
      name: conn.channelName.replace(/^#/, ""),
    });
  }
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Open a Slack interactive modal (`views.open`) for creating a Wroket task.
 */
export async function openSlackTaskModal(opts: {
  accessToken: string;
  triggerId: string;
  initialTitle?: string;
  initialNotes?: string;
  projects?: Array<{ id: string; name: string }>;
}): Promise<boolean> {
  const blocks: Array<Record<string, unknown>> = [
    {
      type: "input",
      block_id: "title_block",
      label: { type: "plain_text", text: "Titre de la tâche" },
      element: {
        type: "plain_text_input",
        action_id: "title_input",
        placeholder: { type: "plain_text", text: "Ex : Préparer le comité de pilotage Q3" },
        ...(opts.initialTitle ? { initial_value: opts.initialTitle.slice(0, 200) } : {}),
      },
    },
    {
      type: "input",
      block_id: "deadline_block",
      optional: true,
      label: { type: "plain_text", text: "Échéance" },
      element: {
        type: "datepicker",
        action_id: "deadline_input",
        placeholder: { type: "plain_text", text: "Choisir une date" },
      },
    },
    {
      type: "input",
      block_id: "effort_block",
      optional: true,
      label: { type: "plain_text", text: "Effort estimé" },
      element: {
        type: "static_select",
        action_id: "effort_input",
        placeholder: { type: "plain_text", text: "Sélectionner un effort" },
        options: [
          { text: { type: "plain_text", text: "Léger (light)" }, value: "light" },
          { text: { type: "plain_text", text: "Moyen (medium)" }, value: "medium" },
          { text: { type: "plain_text", text: "Élevé (heavy)" }, value: "heavy" },
        ],
      },
    },
  ];

  const projectOptions = (opts.projects ?? []).slice(0, 50).map((p) => ({
    text: { type: "plain_text", text: p.name.slice(0, 75) },
    value: p.id,
  }));
  if (projectOptions.length > 0) {
    blocks.push({
      type: "input",
      block_id: "project_block",
      optional: true,
      label: { type: "plain_text", text: "Projet" },
      element: {
        type: "static_select",
        action_id: "project_input",
        placeholder: { type: "plain_text", text: "Associer à un projet" },
        options: projectOptions,
      },
    });
  }

  blocks.push({
    type: "input",
    block_id: "notes_block",
    optional: true,
    label: { type: "plain_text", text: "Notes / contexte" },
    element: {
      type: "plain_text_input",
      action_id: "notes_input",
      multiline: true,
      ...(opts.initialNotes ? { initial_value: opts.initialNotes.slice(0, 1500) } : {}),
    },
  });

  const res = await fetch("https://slack.com/api/views.open", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      trigger_id: opts.triggerId,
      view: {
        type: "modal",
        callback_id: "wroket_create_task_modal",
        title: { type: "plain_text", text: "Nouvelle tâche Wroket" },
        submit: { type: "plain_text", text: "Créer" },
        close: { type: "plain_text", text: "Annuler" },
        blocks,
      },
    }),
    signal: AbortSignal.timeout(5_000),
  });
  const data = (await res.json()) as SlackApiOk;
  if (!data.ok) {
    console.warn("[slack] views.open failed: %s", data.error ?? res.status);
    return false;
  }
  return true;
}

/**
 * Publish an interactive App Home view (`views.publish`) for a Slack user.
 */
export async function publishSlackAppHome(opts: {
  accessToken: string;
  slackUserId: string;
  blocks: unknown[];
}): Promise<boolean> {
  const res = await fetch("https://slack.com/api/views.publish", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      user_id: opts.slackUserId,
      view: {
        type: "home",
        blocks: opts.blocks,
      },
    }),
    signal: AbortSignal.timeout(5_000),
  });
  const data = (await res.json()) as SlackApiOk;
  if (!data.ok) {
    console.warn("[slack] views.publish failed: %s", data.error ?? res.status);
    return false;
  }
  return true;
}

/**
 * Post a message to a specific Slack channel or thread (`chat.postMessage`).
 */
export async function postSlackChannelMessage(opts: {
  accessToken: string;
  channelId: string;
  text: string;
  threadTs?: string;
  blocks?: unknown[];
}): Promise<boolean> {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel: opts.channelId,
      text: opts.text,
      ...(opts.threadTs ? { thread_ts: opts.threadTs } : {}),
      ...(opts.blocks ? { blocks: opts.blocks } : {}),
      unfurl_links: false,
    }),
    signal: AbortSignal.timeout(5_000),
  });
  const data = (await res.json()) as SlackApiOk;
  if (!data.ok) {
    console.warn("[slack] chat.postMessage failed: %s", data.error ?? res.status);
    return false;
  }
  return true;
}
