import { API_BASE_URL, extractApiMessage, parseJsonOrThrow } from "./core";
import type { ApiKeyPublic } from "./apiKeys";

export interface ExtensionAuthorizeResponse {
  code: string;
  redirectUri: string;
  expiresIn: number;
}

/**
 * Session-authenticated: issue a one-shot PKCE auth code for the Chrome extension.
 */
export async function authorizeExtension(input: {
  codeChallenge: string;
  redirectUri: string;
  browserName?: string;
}): Promise<ExtensionAuthorizeResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/extension/authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow(res);
  if (!res.ok) throw new Error(extractApiMessage(body, "Autorisation extension impossible"));
  return body as ExtensionAuthorizeResponse;
}

export async function listExtensionBrowsers(): Promise<ApiKeyPublic[]> {
  const res = await fetch(`${API_BASE_URL}/auth/extension/browsers`, {
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Impossible de lister les navigateurs"));
  }
  const data = (await res.json()) as { browsers?: ApiKeyPublic[] };
  return Array.isArray(data.browsers) ? data.browsers : [];
}

export async function revokeExtensionBrowser(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/extension/browsers/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Révocation impossible"));
  }
}

/** True when redirect_uri is a Chrome identity callback host. */
export function isAllowedExtensionRedirectUri(uri: string): boolean {
  try {
    const u = new URL(uri);
    return u.protocol === "https:" && u.hostname.endsWith(".chromiumapp.org");
  } catch {
    return false;
  }
}
