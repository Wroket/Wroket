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
