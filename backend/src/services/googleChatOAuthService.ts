/**
 * Google Chat app OAuth (Chat+). Uses GOOGLE_CHAT_* with fallback to GOOGLE_CLIENT_*.
 */

import { createOAuthState } from "../utils/oauthState";
import { ValidationError } from "../utils/errors";
import {
  getGoogleChatConnectionForUser,
  upsertGoogleChatConnection,
} from "./googleChatConnectionService";

function chatClientId(): string {
  return process.env.GOOGLE_CHAT_CLIENT_ID?.trim() || process.env.GOOGLE_CLIENT_ID?.trim() || "";
}

function chatClientSecret(): string {
  return (
    process.env.GOOGLE_CHAT_CLIENT_SECRET?.trim() || process.env.GOOGLE_CLIENT_SECRET?.trim() || ""
  );
}

const CHAT_REDIRECT_URI =
  process.env.GOOGLE_CHAT_REDIRECT_URI ??
  "http://localhost:3001/integrations/google-chat/callback";

/** Chat API scopes — chat.spaces + messages for posting; email for identity. */
const CHAT_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/chat.spaces",
  "https://www.googleapis.com/auth/chat.messages",
].join(" ");

export function isGoogleChatOAuthConfigured(): boolean {
  return chatClientId().length > 0 && chatClientSecret().length > 0;
}

export function getGoogleChatVerificationToken(): string {
  return process.env.GOOGLE_CHAT_VERIFICATION_TOKEN?.trim() || "";
}

export function isGoogleChatInboundConfigured(): boolean {
  return Boolean(
    getGoogleChatVerificationToken() ||
      process.env.GOOGLE_CHAT_PROJECT_NUMBER?.trim() ||
      isGoogleChatOAuthConfigured(),
  );
}

export function getGoogleChatAuthorizeUrl(uid: string, returnTo?: string): string {
  const state = createOAuthState(uid, returnTo);
  const params = new URLSearchParams({
    client_id: chatClientId(),
    redirect_uri: CHAT_REDIRECT_URI,
    response_type: "code",
    scope: CHAT_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
  error?: string;
}

export async function exchangeGoogleChatOAuthCode(
  code: string,
  uid: string,
  email: string,
): Promise<{ spaceDisplayName: string }> {
  const body = new URLSearchParams({
    code,
    client_id: chatClientId(),
    client_secret: chatClientSecret(),
    redirect_uri: CHAT_REDIRECT_URI,
    grant_type: "authorization_code",
  });
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const tokens = (await tokenRes.json()) as GoogleTokenResponse;
  if (!tokens.access_token) {
    console.error("[google-chat-oauth] exchange failed:", tokens.error);
    throw new Error("Google Chat OAuth token exchange failed");
  }

  const existing = getGoogleChatConnectionForUser(uid);
  let spaceName =
    existing?.spaceName && existing.spaceName !== "spaces/unknown"
      ? existing.spaceName
      : "spaces/unknown";
  let spaceDisplayName = existing?.spaceDisplayName || "Google Chat";

  try {
    const spacesRes = await fetch("https://chat.googleapis.com/v1/spaces?pageSize=25", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (spacesRes.ok) {
      const data = (await spacesRes.json()) as {
        spaces?: Array<{ name?: string; displayName?: string; spaceType?: string }>;
      };
      const list = data.spaces ?? [];
      if (spaceName === "spaces/unknown" && list.length > 0) {
        const preferred =
          list.find((s) => s.name && s.displayName && s.spaceType === "SPACE") ??
          list.find((s) => s.name && s.displayName) ??
          list[0];
        if (preferred?.name) {
          spaceName = preferred.name;
          spaceDisplayName = preferred.displayName ?? spaceName;
        }
      }
    }
  } catch (err) {
    console.warn("[google-chat-oauth] list spaces failed:", err);
  }

  const accessTokenExpiresAt =
    typeof tokens.expires_in === "number" && tokens.expires_in > 60
      ? new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString()
      : undefined;

  upsertGoogleChatConnection({
    ownerUid: uid,
    ownerEmail: email,
    spaceName,
    spaceDisplayName,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? existing?.refreshToken,
    accessTokenExpiresAt,
  });

  return { spaceDisplayName };
}

/**
 * Returns a valid Google Chat OAuth access token for the user, refreshing via refresh_token when expired.
 */
export async function getValidGoogleChatAccessToken(
  uid: string,
  opts?: { forceRefresh?: boolean },
): Promise<string | null> {
  const conn = getGoogleChatConnectionForUser(uid);
  if (!conn?.accessToken) return null;

  const isExpired =
    opts?.forceRefresh === true ||
    (conn.accessTokenExpiresAt
      ? new Date(conn.accessTokenExpiresAt).getTime() <= Date.now()
      : false);

  if (!isExpired) {
    return conn.accessToken;
  }

  if (!conn.refreshToken || !isGoogleChatOAuthConfigured()) {
    return conn.accessToken;
  }

  try {
    const body = new URLSearchParams({
      client_id: chatClientId(),
      client_secret: chatClientSecret(),
      refresh_token: conn.refreshToken,
      grant_type: "refresh_token",
    });
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(8_000),
    });
    const tokens = (await res.json()) as GoogleTokenResponse;
    if (!res.ok || !tokens.access_token) {
      console.warn("[google-chat-oauth] refresh failed:", tokens.error ?? res.status);
      return conn.accessToken;
    }
    const accessTokenExpiresAt =
      typeof tokens.expires_in === "number" && tokens.expires_in > 60
        ? new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString()
        : undefined;
    upsertGoogleChatConnection({
      ownerUid: conn.ownerUid,
      ownerEmail: conn.ownerEmail,
      spaceName: conn.spaceName,
      spaceDisplayName: conn.spaceDisplayName,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? conn.refreshToken,
      accessTokenExpiresAt,
    });
    return tokens.access_token;
  } catch (err) {
    console.warn("[google-chat-oauth] refresh error:", err);
    return conn.accessToken;
  }
}

export interface GoogleChatSpaceOption {
  name: string;
  displayName: string;
  spaceType?: string;
}

/**
 * List Google Chat spaces accessible to the connected user.
 */
export async function listGoogleChatSpacesForUser(uid: string): Promise<GoogleChatSpaceOption[]> {
  const conn = getGoogleChatConnectionForUser(uid);
  if (!conn) {
    throw new ValidationError("Google Chat n'est pas connecté", "GOOGLE_CHAT_NOT_CONNECTED");
  }
  const token = await getValidGoogleChatAccessToken(uid);
  if (!token) {
    throw new ValidationError("Jeton Google Chat manquant — reconnectez Google Chat.", "GOOGLE_CHAT_NOT_CONNECTED");
  }

  let res = await fetch("https://chat.googleapis.com/v1/spaces?pageSize=50", {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8_000),
  });
  if (res.status === 401) {
    const refreshed = await getValidGoogleChatAccessToken(uid, { forceRefresh: true });
    if (refreshed) {
      res = await fetch("https://chat.googleapis.com/v1/spaces?pageSize=50", {
        headers: { Authorization: `Bearer ${refreshed}` },
        signal: AbortSignal.timeout(8_000),
      });
    }
  }
  if (!res.ok) {
    throw new ValidationError(
      `Impossible de lister les espaces Google Chat (HTTP ${res.status}).`,
      "GOOGLE_CHAT_SPACES_LIST_FAILED",
    );
  }
  const data = (await res.json()) as {
    spaces?: Array<{ name?: string; displayName?: string; spaceType?: string }>;
  };
  const out: GoogleChatSpaceOption[] = [];
  for (const s of data.spaces ?? []) {
    if (s.name) {
      out.push({
        name: s.name,
        displayName: s.displayName?.trim() || s.name,
        spaceType: s.spaceType,
      });
    }
  }
  if (
    conn.spaceName &&
    conn.spaceName !== "spaces/unknown" &&
    !out.some((s) => s.name === conn.spaceName)
  ) {
    out.unshift({
      name: conn.spaceName,
      displayName: conn.spaceDisplayName || conn.spaceName,
    });
  }
  return out;
}
