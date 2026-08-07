/**
 * Persistence for Discord bot connections + optional manual user links (Discord+).
 */

import crypto from "crypto";

import { getStore, scheduleSave } from "../persistence";
import { NotFoundError } from "../utils/errors";

export interface DiscordConnection {
  id: string;
  ownerUid: string;
  ownerEmail: string;
  guildId: string;
  guildName?: string;
  channelId?: string;
  channelName?: string;
  /** Incoming webhook fallback */
  incomingWebhookUrl?: string;
  accessToken?: string;
  refreshToken?: string;
  botInstalled: boolean;
  installedAt: string;
  updatedAt: string;
}

/** Manual Discord user id → Wroket uid when Discord email is unavailable. */
export interface DiscordAccountLink {
  discordUserId: string;
  wroketUid: string;
  linkedAt: string;
}

const connectionsByUid = new Map<string, DiscordConnection>();
const linksByDiscordId = new Map<string, DiscordAccountLink>();
const linksByWroketUid = new Map<string, DiscordAccountLink>();

function hydrate(): void {
  connectionsByUid.clear();
  linksByDiscordId.clear();
  linksByWroketUid.clear();
  const raw = getStore().discordConnections;
  if (raw && typeof raw === "object") {
    for (const row of Object.values(raw)) {
      const conn = row as DiscordConnection;
      if (conn?.id && conn.ownerUid) connectionsByUid.set(conn.ownerUid, conn);
    }
  }
  const links = getStore().discordAccountLinks;
  if (links && typeof links === "object") {
    for (const row of Object.values(links)) {
      const link = row as DiscordAccountLink;
      if (link?.discordUserId && link.wroketUid) {
        linksByDiscordId.set(link.discordUserId, link);
        linksByWroketUid.set(link.wroketUid, link);
      }
    }
  }
}

if (getStore().discordConnections || getStore().discordAccountLinks) hydrate();

function persistConnections(): void {
  const obj: Record<string, DiscordConnection> = {};
  connectionsByUid.forEach((c) => {
    obj[c.id] = c;
  });
  getStore().discordConnections = obj;
  scheduleSave("discordConnections");
}

function persistLinks(): void {
  const obj: Record<string, DiscordAccountLink> = {};
  linksByDiscordId.forEach((l) => {
    obj[l.discordUserId] = l;
  });
  getStore().discordAccountLinks = obj;
  scheduleSave("discordAccountLinks");
}

export function getDiscordConnectionForUser(uid: string): DiscordConnection | null {
  return connectionsByUid.get(uid) ?? null;
}

export function getDiscordConnectionForGuild(guildId: string): DiscordConnection | null {
  if (!guildId) return null;
  for (const c of connectionsByUid.values()) {
    if (c.guildId === guildId) return c;
  }
  return null;
}

export function upsertDiscordConnection(input: {
  ownerUid: string;
  ownerEmail: string;
  guildId: string;
  guildName?: string;
  channelId?: string;
  channelName?: string;
  incomingWebhookUrl?: string;
  accessToken?: string;
  refreshToken?: string;
  botInstalled?: boolean;
}): DiscordConnection {
  const existing = connectionsByUid.get(input.ownerUid);
  const now = new Date().toISOString();
  if (existing) {
    Object.assign(existing, {
      ...input,
      botInstalled: input.botInstalled ?? existing.botInstalled,
      updatedAt: now,
    });
    persistConnections();
    return existing;
  }
  const conn: DiscordConnection = {
    id: crypto.randomUUID(),
    botInstalled: input.botInstalled ?? true,
    ...input,
    installedAt: now,
    updatedAt: now,
  };
  connectionsByUid.set(input.ownerUid, conn);
  persistConnections();
  return conn;
}

export function deleteDiscordConnectionForUser(uid: string): DiscordConnection | null {
  const existing = connectionsByUid.get(uid);
  if (!existing) return null;
  connectionsByUid.delete(uid);
  persistConnections();
  return existing;
}

export function linkDiscordAccount(wroketUid: string, discordUserId: string): DiscordAccountLink {
  const id = discordUserId.trim();
  if (!id) throw new NotFoundError("discordUserId requis");
  // Remove previous links for this wroket user
  const prev = linksByWroketUid.get(wroketUid);
  if (prev) linksByDiscordId.delete(prev.discordUserId);
  const link: DiscordAccountLink = {
    discordUserId: id,
    wroketUid,
    linkedAt: new Date().toISOString(),
  };
  linksByDiscordId.set(id, link);
  linksByWroketUid.set(wroketUid, link);
  persistLinks();
  return link;
}

export function unlinkDiscordAccount(wroketUid: string): boolean {
  const prev = linksByWroketUid.get(wroketUid);
  if (!prev) return false;
  linksByDiscordId.delete(prev.discordUserId);
  linksByWroketUid.delete(wroketUid);
  persistLinks();
  return true;
}

export function getDiscordLinkForDiscordUser(discordUserId: string): DiscordAccountLink | null {
  return linksByDiscordId.get(discordUserId) ?? null;
}

export function getDiscordLinkForWroketUser(uid: string): DiscordAccountLink | null {
  return linksByWroketUid.get(uid) ?? null;
}

export interface DiscordConnectionSummary {
  connected: boolean;
  guildName: string | null;
  channelName: string | null;
  channelId: string | null;
  installedAt: string | null;
  linkedDiscordUserId: string | null;
}

export function getDiscordConnectionSummary(uid: string): DiscordConnectionSummary {
  const conn = connectionsByUid.get(uid);
  const link = linksByWroketUid.get(uid);
  if (!conn) {
    return {
      connected: false,
      guildName: null,
      channelName: null,
      channelId: null,
      installedAt: null,
      linkedDiscordUserId: link?.discordUserId ?? null,
    };
  }
  return {
    connected: true,
    guildName: conn.guildName ?? null,
    channelName: conn.channelName ?? null,
    channelId: conn.channelId ?? null,
    installedAt: conn.installedAt,
    linkedDiscordUserId: link?.discordUserId ?? null,
  };
}

export function _resetDiscordConnectionsForTests(): void {
  connectionsByUid.clear();
  linksByDiscordId.clear();
  linksByWroketUid.clear();
  getStore().discordConnections = {};
  getStore().discordAccountLinks = {};
}
