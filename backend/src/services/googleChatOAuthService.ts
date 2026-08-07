/**
 * Google Chat app OAuth (Chat+). Uses GOOGLE_CHAT_* with fallback to GOOGLE_CLIENT_*.
 */

import { createOAuthState } from "../utils/oauthState";
import { upsertGoogleChatConnection } from "./googleChatConnectionService";

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

  let spaceName = "spaces/unknown";
  let spaceDisplayName = "Google Chat";
  try {
    const spacesRes = await fetch("https://chat.googleapis.com/v1/spaces?pageSize=1", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (spacesRes.ok) {
      const data = (await spacesRes.json()) as {
        spaces?: Array<{ name?: string; displayName?: string }>;
      };
      const first = data.spaces?.[0];
      if (first?.name) {
        spaceName = first.name;
        spaceDisplayName = first.displayName ?? spaceName;
      }
    }
  } catch (err) {
    console.warn("[google-chat-oauth] list spaces failed:", err);
  }

  upsertGoogleChatConnection({
    ownerUid: uid,
    ownerEmail: email,
    spaceName,
    spaceDisplayName,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
  });

  return { spaceDisplayName };
}
