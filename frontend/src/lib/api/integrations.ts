import {
  API_BASE_URL,
  apiFetchDefaults,
} from "./core";
import { parseApiErrorResponse } from "@/lib/apiErrors";

export type ExternalProvider = "notion" | "monday";

export type ConnectionStatus = "connected" | "disconnected";

export interface AppConnectionSummary {
  id: string;
  provider: ExternalProvider;
  status: ConnectionStatus;
  connectedAt: string | null;
  workspaceName: string | null;
  ownerEmail: string;
  grantedScopes?: string | null;
}

export async function getConnections(): Promise<AppConnectionSummary[]> {
  const res = await fetch(`${API_BASE_URL}/integrations/connections`, {
    ...apiFetchDefaults,
  });
  if (!res.ok) {
    throw await parseApiErrorResponse(res, "toast.genericError");
  }
  const data = (await res.json()) as { connections: AppConnectionSummary[] };
  return data.connections;
}

/** Redirects the browser to Notion OAuth (cookie auth on API domain). */
export function connectNotionOAuth(returnTo?: string): void {
  const qs = returnTo?.trim()
    ? `?returnTo=${encodeURIComponent(returnTo.trim())}`
    : "";
  window.location.href = `${API_BASE_URL}/integrations/notion/connect${qs}`;
}

export async function disconnectNotionConnection(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/integrations/notion/connection`, {
    ...apiFetchDefaults,
    method: "DELETE",
  });
  if (!res.ok) {
    throw await parseApiErrorResponse(res, "toast.genericError");
  }
}

/** Redirects the browser to Monday OAuth (cookie auth on API domain). */
export function connectMondayOAuth(returnTo?: string): void {
  const qs = returnTo?.trim()
    ? `?returnTo=${encodeURIComponent(returnTo.trim())}`
    : "";
  window.location.href = `${API_BASE_URL}/integrations/monday/connect${qs}`;
}

export async function disconnectMondayConnection(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/integrations/monday/connection`, {
    ...apiFetchDefaults,
    method: "DELETE",
  });
  if (!res.ok) {
    throw await parseApiErrorResponse(res, "toast.genericError");
  }
}

export interface SlackConnectionStatus {
  connected: boolean;
  teamName: string | null;
  channelName: string | null;
  channelId: string | null;
  installedAt: string | null;
}

export async function getSlackStatus(): Promise<SlackConnectionStatus> {
  const res = await fetch(`${API_BASE_URL}/integrations/slack/status`, {
    ...apiFetchDefaults,
  });
  if (!res.ok) {
    throw await parseApiErrorResponse(res, "toast.genericError");
  }
  return res.json() as Promise<SlackConnectionStatus>;
}

export function connectSlackOAuth(returnTo?: string): void {
  const qs = returnTo?.trim()
    ? `?returnTo=${encodeURIComponent(returnTo.trim())}`
    : "";
  window.location.href = `${API_BASE_URL}/integrations/slack/connect${qs}`;
}

export async function disconnectSlackConnection(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/integrations/slack/connection`, {
    ...apiFetchDefaults,
    method: "DELETE",
  });
  if (!res.ok) {
    throw await parseApiErrorResponse(res, "toast.genericError");
  }
}

export async function testSlackConnection(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/integrations/slack/test`, {
    ...apiFetchDefaults,
    method: "POST",
  });
  if (!res.ok) {
    throw await parseApiErrorResponse(res, "toast.genericError");
  }
}

/* ─── Microsoft Teams+ ─── */

export interface TeamsConnectionStatus {
  connected: boolean;
  tenantName: string | null;
  channelName: string | null;
  channelId: string | null;
  installedAt: string | null;
}

export async function getTeamsStatus(): Promise<TeamsConnectionStatus> {
  const res = await fetch(`${API_BASE_URL}/integrations/teams/status`, {
    ...apiFetchDefaults,
  });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
  return res.json() as Promise<TeamsConnectionStatus>;
}

export function connectTeamsOAuth(returnTo?: string): void {
  const qs = returnTo?.trim()
    ? `?returnTo=${encodeURIComponent(returnTo.trim())}`
    : "";
  window.location.href = `${API_BASE_URL}/integrations/teams/connect${qs}`;
}

export async function disconnectTeamsConnection(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/integrations/teams/connection`, {
    ...apiFetchDefaults,
    method: "DELETE",
  });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
}

export async function testTeamsConnection(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/integrations/teams/test`, {
    ...apiFetchDefaults,
    method: "POST",
  });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
}

/* ─── Google Chat+ ─── */

export interface GoogleChatConnectionStatus {
  connected: boolean;
  spaceDisplayName: string | null;
  spaceName: string | null;
  installedAt: string | null;
}

export async function getGoogleChatStatus(): Promise<GoogleChatConnectionStatus> {
  const res = await fetch(`${API_BASE_URL}/integrations/google-chat/status`, {
    ...apiFetchDefaults,
  });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
  return res.json() as Promise<GoogleChatConnectionStatus>;
}

export function connectGoogleChatOAuth(returnTo?: string): void {
  const qs = returnTo?.trim()
    ? `?returnTo=${encodeURIComponent(returnTo.trim())}`
    : "";
  window.location.href = `${API_BASE_URL}/integrations/google-chat/connect${qs}`;
}

export async function disconnectGoogleChatConnection(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/integrations/google-chat/connection`, {
    ...apiFetchDefaults,
    method: "DELETE",
  });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
}

export async function testGoogleChatConnection(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/integrations/google-chat/test`, {
    ...apiFetchDefaults,
    method: "POST",
  });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
}

/* ─── Discord+ ─── */

export interface DiscordConnectionStatus {
  connected: boolean;
  guildName: string | null;
  channelName: string | null;
  channelId: string | null;
  installedAt: string | null;
  linkedDiscordUserId: string | null;
}

export async function getDiscordStatus(): Promise<DiscordConnectionStatus> {
  const res = await fetch(`${API_BASE_URL}/integrations/discord/status`, {
    ...apiFetchDefaults,
  });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
  return res.json() as Promise<DiscordConnectionStatus>;
}

export function connectDiscordOAuth(returnTo?: string): void {
  const qs = returnTo?.trim()
    ? `?returnTo=${encodeURIComponent(returnTo.trim())}`
    : "";
  window.location.href = `${API_BASE_URL}/integrations/discord/connect${qs}`;
}

export async function disconnectDiscordConnection(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/integrations/discord/connection`, {
    ...apiFetchDefaults,
    method: "DELETE",
  });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
}

export async function testDiscordConnection(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/integrations/discord/test`, {
    ...apiFetchDefaults,
    method: "POST",
  });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
}

export async function linkDiscordUserId(discordUserId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/integrations/discord/link`, {
    ...apiFetchDefaults,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ discordUserId }),
  });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
}

export async function unlinkDiscordUserId(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/integrations/discord/link`, {
    ...apiFetchDefaults,
    method: "DELETE",
  });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
}
