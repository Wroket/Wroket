import { API_BASE_URL, extractApiMessage, parseJsonOrThrow } from "./core";

export interface ApiKeyPublic {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt?: string;
}

export interface CreateApiKeyResponse extends ApiKeyPublic {
  /** Plaintext secret — shown once. */
  key: string;
}

export async function listApiKeys(): Promise<ApiKeyPublic[]> {
  const res = await fetch(`${API_BASE_URL}/auth/api-keys`, { credentials: "include" });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Impossible de lister les clés API"));
  }
  const data = (await res.json()) as { keys?: ApiKeyPublic[] };
  return Array.isArray(data.keys) ? data.keys : [];
}

export async function createApiKey(name: string): Promise<CreateApiKeyResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/api-keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name }),
  });
  const body = await parseJsonOrThrow(res);
  if (!res.ok) throw new Error(extractApiMessage(body, "Création de clé impossible"));
  return body as CreateApiKeyResponse;
}

export async function revokeApiKey(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/api-keys/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Révocation impossible"));
  }
}

/** Public MCP HTTP URL for snippets (prod or local). */
export function mcpEndpointUrl(): string {
  return `${API_BASE_URL.replace(/\/$/, "")}/mcp`;
}
