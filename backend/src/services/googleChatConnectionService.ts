/**
 * Persistence for Google Chat app connections (Chat+).
 */

import crypto from "crypto";

import { getStore, scheduleSave } from "../persistence";
import { NotFoundError } from "../utils/errors";

export interface GoogleChatConnection {
  id: string;
  ownerUid: string;
  ownerEmail: string;
  spaceName: string;
  spaceDisplayName?: string;
  /** Incoming webhook URL fallback */
  incomingWebhookUrl?: string;
  accessToken?: string;
  refreshToken?: string;
  installedAt: string;
  updatedAt: string;
}

const connectionsByUid = new Map<string, GoogleChatConnection>();

function hydrate(): void {
  connectionsByUid.clear();
  const raw = getStore().googleChatConnections;
  if (!raw || typeof raw !== "object") return;
  for (const row of Object.values(raw)) {
    const conn = row as GoogleChatConnection;
    if (conn?.id && conn.ownerUid) connectionsByUid.set(conn.ownerUid, conn);
  }
}

if (getStore().googleChatConnections) hydrate();

function persist(): void {
  const obj: Record<string, GoogleChatConnection> = {};
  connectionsByUid.forEach((c) => {
    obj[c.id] = c;
  });
  getStore().googleChatConnections = obj;
  scheduleSave("googleChatConnections");
}

export function getGoogleChatConnectionForUser(uid: string): GoogleChatConnection | null {
  return connectionsByUid.get(uid) ?? null;
}

export function upsertGoogleChatConnection(input: {
  ownerUid: string;
  ownerEmail: string;
  spaceName: string;
  spaceDisplayName?: string;
  incomingWebhookUrl?: string;
  accessToken?: string;
  refreshToken?: string;
}): GoogleChatConnection {
  const existing = connectionsByUid.get(input.ownerUid);
  const now = new Date().toISOString();
  if (existing) {
    Object.assign(existing, { ...input, updatedAt: now });
    persist();
    return existing;
  }
  const conn: GoogleChatConnection = {
    id: crypto.randomUUID(),
    ...input,
    installedAt: now,
    updatedAt: now,
  };
  connectionsByUid.set(input.ownerUid, conn);
  persist();
  return conn;
}

export function deleteGoogleChatConnectionForUser(uid: string): GoogleChatConnection | null {
  const existing = connectionsByUid.get(uid);
  if (!existing) return null;
  connectionsByUid.delete(uid);
  persist();
  return existing;
}

export function assertGoogleChatConnectionOwnedBy(uid: string): GoogleChatConnection {
  const conn = connectionsByUid.get(uid);
  if (!conn) throw new NotFoundError("Connexion Google Chat introuvable");
  return conn;
}

export interface GoogleChatConnectionSummary {
  connected: boolean;
  spaceDisplayName: string | null;
  spaceName: string | null;
  installedAt: string | null;
}

export function getGoogleChatConnectionSummary(uid: string): GoogleChatConnectionSummary {
  const conn = connectionsByUid.get(uid);
  if (!conn) {
    return { connected: false, spaceDisplayName: null, spaceName: null, installedAt: null };
  }
  return {
    connected: true,
    spaceDisplayName: conn.spaceDisplayName ?? null,
    spaceName: conn.spaceName,
    installedAt: conn.installedAt,
  };
}

export function _resetGoogleChatConnectionsForTests(): void {
  connectionsByUid.clear();
  getStore().googleChatConnections = {};
}
