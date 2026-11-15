import { CLIENT_HEADER, getConfig } from "./config";
import { getAuth, clearAuth } from "./storage";

export class ExtApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = "ExtApiError";
  }
}

async function authHeaders(): Promise<HeadersInit> {
  const auth = await getAuth();
  if (!auth?.token) throw new ExtApiError("Not connected", 401, "UNAUTHORIZED");
  return {
    Authorization: `Bearer ${auth.token}`,
    "Content-Type": "application/json",
    "X-Wroket-Client": CLIENT_HEADER,
  };
}

export interface BootstrapProject {
  id: string;
  name: string;
  status: string;
  phases: { id: string; name: string; color: string }[];
}

export interface BootstrapResponse {
  me: { uid: string; email: string; locale?: string; billingPlan?: string };
  quotas: unknown;
  projects: BootstrapProject[];
  minVersion: string;
  capabilities: { captureTask: boolean; captureNote: boolean; scheduleDeepLink: boolean };
}

export async function fetchBootstrap(): Promise<BootstrapResponse> {
  const { apiBase } = await getConfig();
  const res = await fetch(`${apiBase}/ext/v1/bootstrap`, {
    headers: await authHeaders(),
  });
  if (res.status === 401) {
    await clearAuth();
    throw new ExtApiError("Session expired — reconnect", 401, "UNAUTHORIZED");
  }
  const body = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
  if (!res.ok) {
    throw new ExtApiError(body.message || `Bootstrap failed (${res.status})`, res.status, body.code);
  }
  return body as BootstrapResponse;
}

export interface CapturePayload {
  clientId?: string;
  kind: "task" | "note";
  title: string;
  projectId?: string | null;
  phaseId?: string | null;
  deadline?: string | null;
  priority?: "low" | "medium" | "high";
  effort?: "light" | "medium" | "heavy";
  tags?: string[];
  estimatedMinutes?: number | null;
  content?: string;
  source?: { url: string; title?: string; excerpt?: string; via: "chrome_ext" };
}

export interface CaptureResult {
  kind: "task" | "note";
  id: string;
  openUrl: string;
  scheduleUrl?: string;
}

export async function capture(payload: CapturePayload): Promise<CaptureResult> {
  const { apiBase } = await getConfig();
  const res = await fetch(`${apiBase}/ext/v1/capture`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });
  if (res.status === 401) {
    await clearAuth();
    throw new ExtApiError("Session expired — reconnect", 401, "UNAUTHORIZED");
  }
  const body = (await res.json().catch(() => ({}))) as {
    message?: string;
    code?: string;
    kind?: string;
    id?: string;
    openUrl?: string;
    scheduleUrl?: string;
  };
  if (!res.ok) {
    throw new ExtApiError(body.message || `Capture failed (${res.status})`, res.status, body.code);
  }
  return {
    kind: body.kind === "note" ? "note" : "task",
    id: body.id!,
    openUrl: body.openUrl!,
    scheduleUrl: body.scheduleUrl,
  };
}

export async function exchangeToken(input: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<{ key: string; id: string }> {
  const { apiBase } = await getConfig();
  const res = await fetch(`${apiBase}/auth/extension/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Wroket-Client": CLIENT_HEADER,
    },
    body: JSON.stringify(input),
  });
  const body = (await res.json().catch(() => ({}))) as {
    message?: string;
    code?: string;
    key?: string;
    id?: string;
  };
  if (!res.ok || !body.key) {
    throw new ExtApiError(body.message || "Token exchange failed", res.status, body.code);
  }
  return { key: body.key, id: body.id ?? "" };
}
