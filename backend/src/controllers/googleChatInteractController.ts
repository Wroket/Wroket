/**
 * Google Chat app HTTP endpoint (events + card clicks).
 * Supports classic Chat events and Workspace add-on envelopes (OIDC + DataActions).
 */

import { Request, Response } from "express";

import {
  getGoogleChatVerificationToken,
  isGoogleChatInboundConfigured,
} from "../services/googleChatOAuthService";
import { verifyGoogleChatOidcBearerDetailed } from "../services/googleChatSignature";
import {
  getGoogleChatConnectionByEmail,
  upsertGoogleChatConnection,
} from "../services/googleChatConnectionService";
import { findUserByEmail } from "../services/authService";
import { taskDeepLink } from "../services/notificationFormatting";
import {
  buildGoogleChatTextReply,
  normalizeGoogleChatEvent,
} from "../services/googleChatEventNormalize";
import {
  googleChatSlashHelp,
  handleGoogleChatCommandText,
  parseGoogleChatCardAction,
  resolveWroketUserFromGoogleChat,
  runGoogleChatTaskAction,
} from "../services/googleChatInteractService";

/**
 * Accept classic verification token OR Workspace add-on OIDC Bearer / systemIdToken.
 */
async function verifyChatRequest(
  req: Request,
  systemIdToken: string | null,
): Promise<boolean> {
  const expected = getGoogleChatVerificationToken();
  if (expected) {
    const token =
      (typeof req.body?.token === "string" && req.body.token) ||
      req.header("x-goog-channel-token") ||
      "";
    if (token === expected) return true;
  }

  const headerResult = await verifyGoogleChatOidcBearerDetailed(
    req.header("authorization") ?? undefined,
  );
  if (headerResult.ok) return true;

  if (systemIdToken) {
    const bodyResult = await verifyGoogleChatOidcBearerDetailed(systemIdToken);
    if (bodyResult.ok) return true;
    console.warn("[google-chat] oidc_reject", {
      headerReason: headerResult.reason,
      bodyReason: bodyResult.reason,
    });
    return false;
  }

  console.warn("[google-chat] oidc_reject", { reason: headerResult.reason });

  // Local-only bypass when explicitly opted in.
  return process.env.NODE_ENV !== "production" && process.env.GOOGLE_CHAT_SKIP_VERIFY === "true";
}

function replyJson(
  res: Response,
  isAddOn: boolean,
  text: string,
  extraClassic?: Record<string, unknown>,
): void {
  if (isAddOn || !extraClassic) {
    res.status(200).json(buildGoogleChatTextReply({ isAddOn, text }));
    return;
  }
  res.status(200).json({ ...extraClassic, text });
}

/**
 * GET /integrations/google-chat/interactions — probe / health (Google and browsers may GET).
 */
export function getGoogleChatInteractions(_req: Request, res: Response): void {
  res.status(200).json({
    ok: true,
    service: "google-chat-interactions",
    inboundConfigured: isGoogleChatInboundConfigured(),
  });
}

/**
 * POST /integrations/google-chat/interactions
 */
export async function postGoogleChatInteractions(req: Request, res: Response): Promise<void> {
  if (!isGoogleChatInboundConfigured()) {
    res.status(503).json({ error: "google_chat_not_configured" });
    return;
  }

  const event = normalizeGoogleChatEvent(req.body);
  console.info("[google-chat] inbound", {
    kind: event.kind,
    isAddOn: event.isAddOn,
    hasEmail: Boolean(event.email),
    hasText: Boolean(event.messageText),
    hasSystemIdToken: Boolean(event.systemIdToken),
    hasAuthHeader: Boolean(req.header("authorization")),
  });

  if (!(await verifyChatRequest(req, event.systemIdToken))) {
    res.status(401).json({ error: "invalid_google_chat_token" });
    return;
  }

  if (event.kind === "url_verification") {
    res.status(200).json({});
    return;
  }

  const email = event.email;

  if (event.kind === "added_to_space") {
    const spaceName = event.spaceName;
    const spaceDisplayName = event.spaceDisplayName || spaceName;
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
    replyJson(
      res,
      event.isAddOn,
      "👋 Wroket est connecté à cet espace ! Tapez `@Wroket help` pour voir les commandes disponibles.",
    );
    return;
  }

  if (event.kind === "removed_from_space") {
    res.status(200).json({});
    return;
  }

  if (event.kind === "card_clicked") {
    const parsed = parseGoogleChatCardAction(event.actionParams ?? {});
    if (!parsed) {
      replyJson(res, event.isAddOn, "Action Wroket non reconnue.");
      return;
    }
    const resolved = await resolveWroketUserFromGoogleChat({ email });
    if ("error" in resolved) {
      replyJson(res, event.isAddOn, resolved.error);
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
      if (event.isAddOn) {
        res.status(200).json(
          buildGoogleChatTextReply({
            isAddOn: true,
            text: `✅ ${result.message}\n${deepLink}`,
          }),
        );
        return;
      }
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
    replyJson(res, event.isAddOn, result.message);
    return;
  }

  if (event.kind === "message") {
    const resolved = await resolveWroketUserFromGoogleChat({ email });
    if ("error" in resolved) {
      replyJson(res, event.isAddOn, resolved.error);
      return;
    }
    try {
      const reply = await handleGoogleChatCommandText({
        actorUid: resolved.uid,
        text: event.messageText ?? "",
      });
      replyJson(res, event.isAddOn, reply || googleChatSlashHelp());
    } catch (err) {
      console.warn("[google-chat] command failed:", err);
      replyJson(res, event.isAddOn, "Erreur lors du traitement de la commande.");
    }
    return;
  }

  console.warn("[google-chat] unknown_event_shape", {
    isAddOn: event.isAddOn,
    rootKeys: req.body && typeof req.body === "object" ? Object.keys(req.body as object) : [],
  });
  res.status(200).json({});
}
