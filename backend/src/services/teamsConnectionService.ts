/**
 * Persistence for Microsoft Teams bot / OAuth connections (Teams+).
 */

import crypto from "crypto";

import { getStore, scheduleSave } from "../persistence";
import { NotFoundError } from "../utils/errors";

export interface TeamsConnection {
  id: string;
  ownerUid: string;
  ownerEmail: string;
  /** Entra tenant id */
  tenantId: string;
  tenantName?: string;
  /** Teams team / conversation id for proactive posts */
  conversationId?: string;
  channelId?: string;
  channelName?: string;
  serviceUrl?: string;
  /** Incoming webhook URL (fallback when bot not in channel). */
  incomingWebhookUrl?: string;
  /** Optional user delegated token (Graph) — rarely used; bot uses app credentials. */
  accessToken?: string;
  refreshToken?: string;
  installedAt: string;
  updatedAt: string;
}

const connectionsByUid = new Map<string, TeamsConnection>();

function hydrate(): void {
  connectionsByUid.clear();
  const raw = getStore().teamsConnections;
  if (!raw || typeof raw !== "object") return;
  for (const row of Object.values(raw)) {
    const conn = row as TeamsConnection;
    if (conn?.id && conn.ownerUid) {
      connectionsByUid.set(conn.ownerUid, conn);
    }
  }
}

if (getStore().teamsConnections) {
  hydrate();
}

function persist(): void {
  const obj: Record<string, TeamsConnection> = {};
  connectionsByUid.forEach((c) => {
    obj[c.id] = c;
  });
  getStore().teamsConnections = obj;
  scheduleSave("teamsConnections");
}

export function getTeamsConnectionForUser(uid: string): TeamsConnection | null {
  return connectionsByUid.get(uid) ?? null;
}

export function getTeamsConnectionForTenant(tenantId: string): TeamsConnection | null {
  if (!tenantId) return null;
  for (const conn of connectionsByUid.values()) {
    if (conn.tenantId === tenantId) return conn;
  }
  return null;
}

export function upsertTeamsConnection(input: {
  ownerUid: string;
  ownerEmail: string;
  tenantId: string;
  tenantName?: string;
  conversationId?: string;
  channelId?: string;
  channelName?: string;
  serviceUrl?: string;
  incomingWebhookUrl?: string;
  accessToken?: string;
  refreshToken?: string;
}): TeamsConnection {
  const existing = connectionsByUid.get(input.ownerUid);
  const now = new Date().toISOString();
  if (existing) {
    Object.assign(existing, {
      ...input,
      updatedAt: now,
    });
    persist();
    return existing;
  }
  const conn: TeamsConnection = {
    id: crypto.randomUUID(),
    ...input,
    installedAt: now,
    updatedAt: now,
  };
  connectionsByUid.set(input.ownerUid, conn);
  persist();
  return conn;
}

export function deleteTeamsConnectionForUser(uid: string): TeamsConnection | null {
  const existing = connectionsByUid.get(uid);
  if (!existing) return null;
  connectionsByUid.delete(uid);
  persist();
  return existing;
}

export function assertTeamsConnectionOwnedBy(uid: string): TeamsConnection {
  const conn = connectionsByUid.get(uid);
  if (!conn) throw new NotFoundError("Connexion Teams introuvable");
  return conn;
}

export interface TeamsConnectionSummary {
  connected: boolean;
  tenantName: string | null;
  channelName: string | null;
  channelId: string | null;
  installedAt: string | null;
}

export function getTeamsConnectionSummary(uid: string): TeamsConnectionSummary {
  const conn = connectionsByUid.get(uid);
  if (!conn) {
    return {
      connected: false,
      tenantName: null,
      channelName: null,
      channelId: null,
      installedAt: null,
    };
  }
  return {
    connected: true,
    tenantName: conn.tenantName ?? conn.tenantId,
    channelName: conn.channelName ?? null,
    channelId: conn.channelId ?? null,
    installedAt: conn.installedAt,
  };
}

export function _resetTeamsConnectionsForTests(): void {
  connectionsByUid.clear();
  getStore().teamsConnections = {};
}
