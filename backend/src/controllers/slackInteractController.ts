/**
 * Slack inbound Lot 3 — interactions (buttons) + slash commands.
 * Expects `req.body` as Buffer (express.raw) for signature verification.
 */

import { Request, Response } from "express";

import {
  getSlackSigningSecret,
  isSlackSigningConfigured,
  verifySlackSignature,
} from "../services/slackSignature";
import {
  actionIdToTaskAction,
  handleSlashText,
  parseButtonValue,
  resolveWroketUserFromSlack,
  runSlackTaskAction,
  slashHelpText,
  updateMessageAfterAction,
} from "../services/slackInteractService";

function rawBodyToString(body: unknown): string {
  if (Buffer.isBuffer(body)) return body.toString("utf8");
  if (typeof body === "string") return body;
  return "";
}

function verifyOrReject(req: Request, res: Response): string | null {
  if (!isSlackSigningConfigured()) {
    console.error("[slack] SLACK_SIGNING_SECRET missing — rejecting inbound");
    res.status(503).json({ error: "slack_signing_not_configured" });
    return null;
  }
  const raw = rawBodyToString(req.body);
  const ok = verifySlackSignature({
    signingSecret: getSlackSigningSecret(),
    timestampHeader: req.header("x-slack-request-timestamp") ?? undefined,
    signatureHeader: req.header("x-slack-signature") ?? undefined,
    rawBody: raw,
  });
  if (!ok) {
    res.status(401).json({ error: "invalid_slack_signature" });
    return null;
  }
  return raw;
}

/**
 * POST /integrations/slack/interactions — block_actions buttons.
 */
export async function postSlackInteractions(req: Request, res: Response): Promise<void> {
  const raw = verifyOrReject(req, res);
  if (raw === null) return;

  const params = new URLSearchParams(raw);
  const payloadRaw = params.get("payload");
  if (!payloadRaw) {
    res.status(400).json({ error: "missing_payload" });
    return;
  }

  let payload: {
    type?: string;
    user?: { id?: string };
    team?: { id?: string };
    channel?: { id?: string };
    response_url?: string;
    message?: { blocks?: unknown };
    actions?: Array<{ action_id?: string; value?: string }>;
  };
  try {
    payload = JSON.parse(payloadRaw) as typeof payload;
  } catch {
    res.status(400).json({ error: "invalid_payload_json" });
    return;
  }

  if (payload.type !== "block_actions") {
    res.status(200).json({ text: "Ignored" });
    return;
  }

  const action = payload.actions?.[0];
  const taskAction = action?.action_id ? actionIdToTaskAction(action.action_id) : null;
  const parsed = parseButtonValue(action?.value);
  if (!taskAction || !parsed) {
    res.status(200).json({
      response_type: "ephemeral",
      text: "Action Wroket non reconnue.",
    });
    return;
  }

  const teamId = payload.team?.id ?? "";
  const slackUserId = payload.user?.id ?? "";
  if (!teamId || !slackUserId) {
    res.status(200).json({ response_type: "ephemeral", text: "Payload Slack incomplet." });
    return;
  }

  const resolved = await resolveWroketUserFromSlack({ teamId, slackUserId });
  if ("error" in resolved) {
    res.status(200).json({ response_type: "ephemeral", text: resolved.error });
    return;
  }

  const result = await runSlackTaskAction({
    actorUid: resolved.uid,
    targetUid: parsed.targetUid,
    todoId: parsed.todoId,
    action: taskAction,
  });

  // Acknowledge quickly; update original message in background.
  res.status(200).json({
    response_type: "ephemeral",
    text: result.message,
  });

  void updateMessageAfterAction({
    responseUrl: payload.response_url,
    originalBlocks: payload.message?.blocks,
    resultText: result.message,
    ok: result.ok,
  });
}

/**
 * POST /integrations/slack/commands — slash `/wroket`.
 */
export async function postSlackCommands(req: Request, res: Response): Promise<void> {
  const raw = verifyOrReject(req, res);
  if (raw === null) return;

  const params = new URLSearchParams(raw);
  const teamId = params.get("team_id") ?? "";
  const slackUserId = params.get("user_id") ?? "";
  const text = params.get("text") ?? "";

  if (!teamId || !slackUserId) {
    res.status(200).json({ response_type: "ephemeral", text: "Payload slash incomplet." });
    return;
  }

  const resolved = await resolveWroketUserFromSlack({ teamId, slackUserId });
  if ("error" in resolved) {
    res.status(200).json({ response_type: "ephemeral", text: resolved.error });
    return;
  }

  try {
    const reply = await handleSlashText({ actorUid: resolved.uid, text });
    res.status(200).json({
      response_type: "ephemeral",
      text: reply || slashHelpText(),
    });
  } catch (err) {
    console.warn("[slack] slash failed:", err);
    res.status(200).json({
      response_type: "ephemeral",
      text: "Erreur lors du traitement de la commande.",
    });
  }
}
