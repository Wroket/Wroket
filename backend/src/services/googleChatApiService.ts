/**
 * Google Chat API posting helpers.
 */

import { ValidationError } from "../utils/errors";
import { getGoogleChatConnectionForUser } from "./googleChatConnectionService";

export async function tryPostViaGoogleChat(uid: string, body: unknown): Promise<boolean> {
  const conn = getGoogleChatConnectionForUser(uid);
  if (!conn?.accessToken || !conn.spaceName || conn.spaceName === "spaces/unknown") return false;

  const payload =
    typeof body === "string"
      ? { text: body }
      : body && typeof body === "object"
        ? body
        : { text: "Notification Wroket" };

  const res = await fetch(`https://chat.googleapis.com/v1/${conn.spaceName}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${conn.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) {
    console.warn("[google-chat] post failed:", res.status, await res.text().catch(() => ""));
    return false;
  }
  return true;
}

export async function postGoogleChatTestMessage(uid: string): Promise<void> {
  const conn = getGoogleChatConnectionForUser(uid);
  if (!conn) {
    throw new ValidationError("Google Chat n'est pas connecté", "GOOGLE_CHAT_NOT_CONNECTED");
  }
  const text = "Test Wroket — connexion Google Chat OK ✅";
  if (await tryPostViaGoogleChat(uid, { text })) return;
  if (conn.incomingWebhookUrl) {
    const wh = await fetch(conn.incomingWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5_000),
    });
    if (wh.ok) return;
  }
  throw new ValidationError(
    "Impossible d’envoyer le test Google Chat. Ajoutez l’app à un espace ou un webhook, puis réessayez.",
    "GOOGLE_CHAT_TEST_FAILED",
  );
}
