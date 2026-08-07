/**
 * Discord OAuth2 bot install (Discord+).
 */

import { createOAuthState } from "../utils/oauthState";
import { upsertDiscordConnection } from "./discordConnectionService";

const DISCORD_CLIENT_ID = () => process.env.DISCORD_CLIENT_ID?.trim() || "";
const DISCORD_CLIENT_SECRET = () => process.env.DISCORD_CLIENT_SECRET?.trim() || "";
const DISCORD_REDIRECT_URI =
  process.env.DISCORD_REDIRECT_URI ?? "http://localhost:3001/integrations/discord/callback";

/** Bot permissions: Send Messages, Embed Links, Use Slash Commands, Read Message History */
const BOT_PERMISSIONS = String(0x800 | 0x4000 | 0x8000000 | 0x400);

export function isDiscordOAuthConfigured(): boolean {
  return DISCORD_CLIENT_ID().length > 0 && DISCORD_CLIENT_SECRET().length > 0;
}

export function getDiscordPublicKey(): string {
  return process.env.DISCORD_PUBLIC_KEY?.trim() || "";
}

export function getDiscordBotToken(): string {
  return process.env.DISCORD_BOT_TOKEN?.trim() || "";
}

export function isDiscordInboundConfigured(): boolean {
  return getDiscordPublicKey().length > 0;
}

export function getDiscordAuthorizeUrl(uid: string, returnTo?: string): string {
  const state = createOAuthState(uid, returnTo);
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID(),
    permissions: BOT_PERMISSIONS,
    response_type: "code",
    redirect_uri: DISCORD_REDIRECT_URI,
    scope: "bot applications.commands identify email guilds",
    state,
  });
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

interface DiscordTokenResponse {
  access_token?: string;
  refresh_token?: string;
  guild?: { id?: string; name?: string };
  error?: string;
  error_description?: string;
}

export async function exchangeDiscordOAuthCode(
  code: string,
  uid: string,
  email: string,
): Promise<{ guildName: string }> {
  const body = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID(),
    client_secret: DISCORD_CLIENT_SECRET(),
    grant_type: "authorization_code",
    code,
    redirect_uri: DISCORD_REDIRECT_URI,
  });
  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const tokens = (await tokenRes.json()) as DiscordTokenResponse;
  if (!tokens.access_token) {
    console.error("[discord-oauth] exchange failed:", tokens.error_description ?? tokens.error);
    throw new Error("Discord OAuth token exchange failed");
  }

  const guildId = tokens.guild?.id ?? "unknown";
  const guildName = tokens.guild?.name ?? "Discord";

  upsertDiscordConnection({
    ownerUid: uid,
    ownerEmail: email,
    guildId,
    guildName,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    botInstalled: true,
  });

  return { guildName };
}
