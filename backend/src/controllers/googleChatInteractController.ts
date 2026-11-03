/**
 * Google Chat app HTTP endpoint (events + card clicks).
 */

import { Request, Response } from "express";

import {
  getGoogleChatVerificationToken,
  isGoogleChatInboundConfigured,
} from "../services/googleChatOAuthService";
import {
  getGoogleChatConnectionByEmail,
  upsertGoogleChatConnection,
} from "../services/googleChatConnectionService";
import { findUserByEmail } from "../services/authService";
import { taskDeepLink } from "../services/notificationFormatting";
import {
  googleChatSlashHelp,
  handleGoogleChatCommandText,
  parseGoogleChatCardAction,
  resolveWroketUserFromGoogleChat,
  runGoogleChatTaskAction,
} from "../services/googleChatInteractService";

function verifyToken(req: Request): boolean {
  const expected = getGoogleChatVerificationToken();
  if (!expected) {
    // Allow when only OAuth configured and skip flag set (local).
    return process.env.NODE_ENV !== "production" && process.env.GOOGLE_CHAT_SKIP_VERIFY === "true";
  }
  const token =
    (typeof req.body?.token === "string" && req.body.token) ||
    req.header("x-goog-channel-token") ||
    "";
  return token === expected;
}

/**
 * POST /integrations/google-chat/interactions
 */
export async function postGoogleChatInteractions(req: Request, res: Response): Promise<void> {
  if (!isGoogleChatInboundConfigured()) {
    res.status(503).json({ error: "google_chat_not_configured" });
    return;
  }
  if (!verifyToken(req)) {
    res.status(401).json({ error: "invalid_google_chat_token" });
    return;
  }

  const body = req.body as {
    type?: string;
    token?: string;
    space?: { name?: string; displayName?: string; type?: string };
    message?: { text?: string; sender?: { email?: string } };
    user?: { email?: string };
    common?: { user?: { email?: string } };
    action?: { actionMethodName?: string; parameters?: unknown[] };
    // Cards v2
  };

  // URL verification handshake
  if (body.type === "URL_VERIFICATION") {
    res.status(200).json({});
    return;
  }

  const email =
    body.user?.email ||
    body.common?.user?.email ||
    body.message?.sender?.email ||
    null;

  // Bot added to a space -> auto-attach space to user's Google Chat connection if available
  if (body.type === "ADDED_TO_SPACE") {
    const spaceName = body.space?.name?.trim();
    const spaceDisplayName = body.space?.displayName?.trim() || spaceName;
    if (email && spaceName) {
      const existing = getGoogleChatConnectionByEmail(email);
      const user = findUserByEmail(email);
      if (existing) {
        if (!existing.spaceName || existing.spaceName === "spaces/unknown") {
          upsertGoogleChatConnection({
            ownerUid: existing.ownerUid,
            ownerEmail: existing.ownerEmail,
            spaceName,
            spaceDisplayName,
          });
        }
      } else if (user) {
        upsertGoogleChatConnection({
          ownerUid: user.uid,
          ownerEmail: user.email,
          spaceName,
          spaceDisplayName,
        });
      }
    }
    res.status(200).json({
      text: "👋 Wroket est connecté à cet espace ! Tapez `@Wroket help` pour voir les commandes disponibles.",
    });
    return;
  }

  // Card click
  if (body.type === "CARD_CLICKED" || body.action) {
    const paramsObj: Record<string, unknown> = {
      actionMethodName: body.action?.actionMethodName,
    };
    if (Array.isArray(body.action?.parameters)) {
      for (const p of body.action.parameters) {
        if (p && typeof p === "object" && "key" in p && "value" in p) {
          const row = p as { key: string; value: string };
          paramsObj[row.key] = row.value;
        }
      }
    }
    const parsed = parseGoogleChatCardAction(paramsObj);
    if (!parsed) {
      res.status(200).json({ text: "Action Wroket non reconnue." });
      return;
    }
    const resolved = await resolveWroketUserFromGoogleChat({ email });
    if ("error" in resolved) {
      res.status(200).json({ text: resolved.error });
      return;
    }
    const result = await runGoogleChatTaskAction({
      actorUid: resolved.uid,
      targetUid: parsed.targetUid,
      todoId: parsed.todoId,
      action: parsed.action,
    });
    if (result.ok) {
      const deepLink = taskDeepLink(parsed.todoId);
      res.status(200).json({
        actionResponse: { type: "UPDATE_MESSAGE" },
        text: `✅ ${result.message}`,
        cardsV2: [
          {
            cardId: "wroket",
            card: {
              sections: [
                {
                  widgets: [
                    { textParagraph: { text: `<b>✅ Action enregistrée</b><br>${result.message}` } },
                    {
                      buttonList: {
                        buttons: [
                          {
                            text: "Ouvrir dans Wroket",
                            onClick: { openLink: { url: deepLink } },
                          },
                        ],
                      },
                    },
                  ],
                },
              ],
            },
          },
        ],
      });
      return;
    }
    res.status(200).json({ text: result.message });
    return;
  }

  // MESSAGE
  if (body.type === "MESSAGE" || body.message?.text) {
    const resolved = await resolveWroketUserFromGoogleChat({ email });
    if ("error" in resolved) {
      res.status(200).json({ text: resolved.error });
      return;
    }
    try {
      const reply = await handleGoogleChatCommandText({
        actorUid: resolved.uid,
        text: body.message?.text ?? "",
      });
      res.status(200).json({ text: reply || googleChatSlashHelp() });
    } catch (err) {
      console.warn("[google-chat] command failed:", err);
      res.status(200).json({ text: "Erreur lors du traitement de la commande." });
    }
    return;
  }

  res.status(200).json({});
}
