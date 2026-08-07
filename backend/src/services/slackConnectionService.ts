/**
 * Persistence for Slack workspace OAuth connections (Lot 2).
 * Tokens stored like Notion/Monday (store plaintext; strip from RGPD exports).
 */

import crypto from "crypto";

import { getStore, scheduleSave } from "../persistence";
import { NotFoundError } from "../utils/errors";

export interface SlackConnection {
  id: string;
  ownerUid: string;
  ownerEmail: string;
  accessToken: string;
  teamId: string;
  teamName: string;
  channelId?: string;
  channelName?: string;
  /** Incoming webhook URL returned by Slack OAuth (optional fallback). */
  incomingWebhookUrl?: string;
  botUserId?: string;
  installedAt: string;
  updatedAt: string;
}

const connectionsByUid = new Map<string, SlackConnection>();

function hydrate(): void {
  connectionsByUid.clear();
  const raw = getStore().slackConnections;
  if (!raw || typeof raw !== "object") return;
  for (const row of Object.values(raw)) {
    const conn = row as SlackConnection;
    if (conn?.id && conn.ownerUid && conn.accessToken) {
      connectionsByUid.set(conn.ownerUid, conn);
    }
  }
}

if (getStore().slackConnections) {
  hydrate();
}

function persist(): void {
  const obj: Record<string, SlackConnection> = {};
  connectionsByUid.forEach((c) => {
    obj[c.id] = c;
  });
  getStore().slackConnections = obj;
  scheduleSave("slackConnections");
}

export function getSlackConnectionForUser(uid: string): SlackConnection | null {
  return connectionsByUid.get(uid) ?? null;
}

/** First bot token for a Slack workspace (for inbound interactivity). */
export function getSlackBotTokenForTeam(teamId: string): string | null {
  if (!teamId) return null;
  for (const conn of connectionsByUid.values()) {
    if (conn.teamId === teamId && conn.accessToken) return conn.accessToken;
  }
  return null;
}

export function upsertSlackConnection(input: {
  ownerUid: string;
  ownerEmail: string;
  accessToken: string;
  teamId: string;
  teamName: string;
  channelId?: string;
  channelName?: string;
  incomingWebhookUrl?: string;
  botUserId?: string;
}): SlackConnection {
  const existing = connectionsByUid.get(input.ownerUid);
  const now = new Date().toISOString();
  if (existing) {
    existing.accessToken = input.accessToken;
    existing.ownerEmail = input.ownerEmail;
    existing.teamId = input.teamId;
    existing.teamName = input.teamName;
    existing.channelId = input.channelId;
    existing.channelName = input.channelName;
    existing.incomingWebhookUrl = input.incomingWebhookUrl;
    existing.botUserId = input.botUserId;
    existing.updatedAt = now;
    persist();
    return existing;
  }
  const conn: SlackConnection = {
    id: crypto.randomUUID(),
    ownerUid: input.ownerUid,
    ownerEmail: input.ownerEmail,
    accessToken: input.accessToken,
    teamId: input.teamId,
    teamName: input.teamName,
    channelId: input.channelId,
    channelName: input.channelName,
    incomingWebhookUrl: input.incomingWebhookUrl,
    botUserId: input.botUserId,
    installedAt: now,
    updatedAt: now,
  };
  connectionsByUid.set(input.ownerUid, conn);
  persist();
  return conn;
}

export function deleteSlackConnectionForUser(uid: string): SlackConnection | null {
  const existing = connectionsByUid.get(uid);
  if (!existing) return null;
  connectionsByUid.delete(uid);
  persist();
  return existing;
}

export function assertSlackConnectionOwnedBy(uid: string): SlackConnection {
  const conn = connectionsByUid.get(uid);
  if (!conn) throw new NotFoundError("Connexion Slack introuvable");
  return conn;
}

export interface SlackConnectionSummary {
  connected: boolean;
  teamName: string | null;
  channelName: string | null;
  channelId: string | null;
  installedAt: string | null;
}

export function getSlackConnectionSummary(uid: string): SlackConnectionSummary {
  const conn = connectionsByUid.get(uid);
  if (!conn) {
    return {
      connected: false,
      teamName: null,
      channelName: null,
      channelId: null,
      installedAt: null,
    };
  }
  return {
    connected: true,
    teamName: conn.teamName,
    channelName: conn.channelName ?? null,
    channelId: conn.channelId ?? null,
    installedAt: conn.installedAt,
  };
}

/** Test helper */
export function _resetSlackConnectionsForTests(): void {
  connectionsByUid.clear();
  getStore().slackConnections = {};
}
