/**
 * Discord bot API helpers.
 */

import { ValidationError } from "../utils/errors";
import {
  getDiscordConnectionForUser,
  updateDiscordChannelForUser,
} from "./discordConnectionService";
import { getDiscordBotToken } from "./discordOAuthService";

/** Discord channel type: GUILD_TEXT */
const GUILD_TEXT = 0;

export interface DiscordChannelOption {
  id: string;
  name: string;
}

/**
 * List text channels in the connected guild (bot token).
 */
export async function listDiscordChannelsForUser(uid: string): Promise<DiscordChannelOption[]> {
  const conn = getDiscordConnectionForUser(uid);
  const token = getDiscordBotToken();
  if (!conn?.guildId || conn.guildId === "unknown" || !token) {
    throw new ValidationError("Discord n'est pas connecté", "DISCORD_NOT_CONNECTED");
  }

  const res = await fetch(`https://discord.com/api/v10/guilds/${conn.guildId}/channels`, {
    headers: { Authorization: `Bot ${token}` },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) {
    throw new ValidationError(
      `Impossible de lister les salons Discord (${res.status}).`,
      "DISCORD_CHANNELS_LIST_FAILED",
    );
  }
  const rows = (await res.json()) as Array<{ id?: string; name?: string; type?: number }>;
  const list: DiscordChannelOption[] = [];
  for (const ch of rows) {
    if (ch.id && ch.name && ch.type === GUILD_TEXT) {
      list.push({ id: ch.id, name: ch.name });
    }
  }
  if (conn.channelId && conn.channelName && !list.some((c) => c.id === conn.channelId)) {
    list.unshift({ id: conn.channelId, name: conn.channelName.replace(/^#/, "") });
  }
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * If no channel is set, pick the first text channel the bot can see.
 */
export async function ensureDiscordDefaultChannel(uid: string): Promise<boolean> {
  const conn = getDiscordConnectionForUser(uid);
  if (!conn || conn.channelId) return Boolean(conn?.channelId);
  try {
    const channels = await listDiscordChannelsForUser(uid);
    const first = channels[0];
    if (!first) return false;
    updateDiscordChannelForUser(uid, first.id, first.name);
    return true;
  } catch (err) {
    console.warn("[discord] auto channel pick failed:", err);
    return false;
  }
}

export async function tryPostViaDiscordBot(
  uid: string,
  content: string,
  embeds?: unknown[],
  components?: unknown[],
): Promise<boolean> {
  const conn = getDiscordConnectionForUser(uid);
  const token = getDiscordBotToken();
  if (!conn?.channelId || !token) return false;

  const res = await fetch(`https://discord.com/api/v10/channels/${conn.channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content, embeds, components }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) {
    console.warn("[discord] channel post failed:", res.status, await res.text().catch(() => ""));
    return false;
  }
  return true;
}

export async function postDiscordTestMessage(uid: string): Promise<void> {
  const conn = getDiscordConnectionForUser(uid);
  if (!conn) {
    throw new ValidationError("Discord n'est pas connecté", "DISCORD_NOT_CONNECTED");
  }
  if (!conn.channelId) {
    await ensureDiscordDefaultChannel(uid);
  }
  const content = "Test Wroket — connexion Discord OK ✅";
  if (await tryPostViaDiscordBot(uid, content)) return;
  if (conn.incomingWebhookUrl) {
    const wh = await fetch(conn.incomingWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
      signal: AbortSignal.timeout(5_000),
    });
    if (wh.ok) return;
  }
  throw new ValidationError(
    "Impossible d’envoyer le test Discord. Choisissez un salon (ou webhook) et réessayez.",
    "DISCORD_TEST_FAILED",
  );
}

export async function fetchDiscordUserEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { email?: string };
    const email = data.email?.trim();
    return email && email.includes("@") ? email : null;
  } catch {
    return null;
  }
}
