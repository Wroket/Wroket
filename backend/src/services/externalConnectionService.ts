/**
 * Persistence for external app OAuth connections (Notion, Monday, …).
 * Tokens are stored in plaintext in the store, consistent with calendar tokens.
 */

import crypto from "crypto";

import { getStore, scheduleSave } from "../persistence";
import { NotFoundError } from "../utils/errors";
import type { ExternalProvider } from "./externalRef";

export interface ExternalConnection {
  id: string;
  provider: ExternalProvider;
  ownerUid: string;
  ownerEmail: string;
  accessToken: string;
  workspaceId?: string;
  workspaceName?: string;
  botId?: string;
  /** Space-separated OAuth scopes granted at last connect (Monday only). */
  grantedScopes?: string;
  connectedAt: string;
  updatedAt: string;
}

const connectionsById = new Map<string, ExternalConnection>();

function hydrateConnections(): void {
  connectionsById.clear();
  const raw = getStore().externalConnections;
  if (!raw || typeof raw !== "object") return;
  for (const row of Object.values(raw)) {
    const conn = row as ExternalConnection;
    if (conn?.id && conn.ownerUid && conn.accessToken) {
      connectionsById.set(conn.id, conn);
    }
  }
}

if (getStore().externalConnections) {
  hydrateConnections();
}

function persistConnections(): void {
  const obj: Record<string, ExternalConnection> = {};
  connectionsById.forEach((c) => {
    obj[c.id] = c;
  });
  getStore().externalConnections = obj;
  scheduleSave("externalConnections");
}

/** Returns the active connection for a user + provider (one per provider per user). */
export function getConnectionForUser(uid: string, provider: ExternalProvider): ExternalConnection | null {
  for (const conn of connectionsById.values()) {
    if (conn.ownerUid === uid && conn.provider === provider) return conn;
  }
  return null;
}

export function getConnectionById(id: string): ExternalConnection | null {
  return connectionsById.get(id) ?? null;
}

export function upsertConnection(input: {
  provider: ExternalProvider;
  ownerUid: string;
  ownerEmail: string;
  accessToken: string;
  workspaceId?: string;
  workspaceName?: string;
  botId?: string;
  grantedScopes?: string;
}): ExternalConnection {
  const existing = getConnectionForUser(input.ownerUid, input.provider);
  const now = new Date().toISOString();
  if (existing) {
    existing.accessToken = input.accessToken;
    existing.ownerEmail = input.ownerEmail;
    existing.workspaceId = input.workspaceId;
    existing.workspaceName = input.workspaceName;
    existing.botId = input.botId;
    existing.grantedScopes = input.grantedScopes;
    existing.updatedAt = now;
    persistConnections();
    return existing;
  }
  const conn: ExternalConnection = {
    id: crypto.randomUUID(),
    provider: input.provider,
    ownerUid: input.ownerUid,
    ownerEmail: input.ownerEmail,
    accessToken: input.accessToken,
    workspaceId: input.workspaceId,
    workspaceName: input.workspaceName,
    botId: input.botId,
    grantedScopes: input.grantedScopes,
    connectedAt: now,
    updatedAt: now,
  };
  connectionsById.set(conn.id, conn);
  persistConnections();
  return conn;
}

export function deleteConnectionForUser(uid: string, provider: ExternalProvider): boolean {
  const conn = getConnectionForUser(uid, provider);
  if (!conn) return false;
  connectionsById.delete(conn.id);
  persistConnections();
  return true;
}

export function assertConnectionOwnedBy(uid: string, connectionId: string): ExternalConnection {
  const conn = connectionsById.get(connectionId);
  if (!conn) throw new NotFoundError("Connexion introuvable");
  if (conn.ownerUid !== uid) throw new NotFoundError("Connexion introuvable");
  return conn;
}

/** Public summary for the Settings connections hub (no tokens). */
export interface ConnectionSummary {
  id: string;
  provider: ExternalProvider;
  status: "connected" | "disconnected";
  connectedAt: string | null;
  workspaceName: string | null;
  ownerEmail: string;
  /** Monday OAuth scopes granted at last connect (e.g. "boards:read docs:read"). */
  grantedScopes?: string | null;
}

export function listConnectionSummariesForUser(uid: string, email: string): ConnectionSummary[] {
  const providers: ExternalProvider[] = ["notion", "monday"];
  return providers.map((provider) => {
    const conn = getConnectionForUser(uid, provider);
    if (!conn) {
      return {
        id: "",
        provider,
        status: "disconnected" as const,
        connectedAt: null,
        workspaceName: null,
        ownerEmail: email,
      };
    }
    return {
      id: conn.id,
      provider,
      status: "connected" as const,
      connectedAt: conn.connectedAt,
      workspaceName: conn.workspaceName ?? null,
      ownerEmail: conn.ownerEmail,
      grantedScopes: provider === "monday" ? (conn.grantedScopes ?? null) : null,
    };
  });
}

/** Test helper — clears in-memory connections. */
export function _resetConnectionsForTests(): void {
  connectionsById.clear();
  getStore().externalConnections = {};
}
