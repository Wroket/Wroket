/**
 * Discord bot API helpers.
 */

import { ValidationError } from "../utils/errors";
import { getDiscordConnectionForUser } from "./discordConnectionService";
import { getDiscordBotToken } from "./discordOAuthService";

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
