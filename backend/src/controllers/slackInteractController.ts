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
  actionIdToTimerAction,
  buildSlackTasksTimerBlocks,
  handleSlackModalSubmission,
  handleSlashText,
  loadTasksForTimerPicker,
  openSlackCreateTaskModalForUser,
  parseButtonValue,
  refreshSlackAppHomeForUser,
  resolveWroketUserFromSlack,
  runSlackTaskAction,
  runSlackTimerButton,
  slashHelpText,
  updateMessageAfterAction,
} from "../services/slackInteractService";
import { postSlackChannelMessage, resolveBotTokenForTeam } from "../services/slackApiService";

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
    trigger_id?: string;
    callback_id?: string;
    user?: { id?: string };
    team?: { id?: string };
    channel?: { id?: string };
    response_url?: string;
    message?: { text?: string; blocks?: unknown };
    view?: {
      type?: string;
      callback_id?: string;
      state?: { values?: Record<string, Record<string, unknown>> };
    };
    actions?: Array<{ action_id?: string; value?: string }>;
  };
  try {
    payload = JSON.parse(payloadRaw) as typeof payload;
  } catch {
    res.status(400).json({ error: "invalid_payload_json" });
    return;
  }

  const teamId = payload.team?.id ?? "";
  const slackUserId = payload.user?.id ?? "";

  // 1. Global / message shortcuts -> open creation modal
  if (payload.type === "shortcut" || payload.type === "message_action") {
    if (!teamId || !slackUserId || !payload.trigger_id) {
      res.status(200).json({});
      return;
    }
    const resolved = await resolveWroketUserFromSlack({ teamId, slackUserId });
    if ("error" in resolved) {
      res.status(200).json({});
      return;
    }
    const msgText = (payload.message?.text ?? "").trim();
    const initialTitle = msgText.split("\n")[0]?.slice(0, 120) || undefined;
    await openSlackCreateTaskModalForUser({
      teamId,
      uid: resolved.uid,
      triggerId: payload.trigger_id,
      initialTitle,
      initialNotes: msgText.length > 0 ? msgText : undefined,
    });
    res.status(200).json({});
    return;
  }

  // 2. Modal submission -> create task
  if (payload.type === "view_submission") {
    if (payload.view?.callback_id !== "wroket_create_task_modal") {
      res.status(200).json({});
      return;
    }
    if (!teamId || !slackUserId) {
      res.status(200).json({});
      return;
    }
    const resolved = await resolveWroketUserFromSlack({ teamId, slackUserId });
    if ("error" in resolved) {
      res.status(200).json({
        response_action: "errors",
        errors: { title_block: resolved.error },
      });
      return;
    }
    const created = await handleSlackModalSubmission({
      uid: resolved.uid,
      stateValues: payload.view?.state?.values,
    });
    if (!created.ok) {
      res.status(200).json({
        response_action: "errors",
        errors: { title_block: created.error },
      });
      return;
    }
    res.status(200).json({ response_action: "clear" });
    void refreshSlackAppHomeForUser({ teamId, slackUserId, uid: resolved.uid });
    return;
  }

  if (payload.type !== "block_actions") {
    res.status(200).json({ text: "Ignored" });
    return;
  }

  const action = payload.actions?.[0];
  const actionId = action?.action_id ?? "";

  if (!teamId || !slackUserId) {
    res.status(200).json({ response_type: "ephemeral", text: "Payload Slack incomplet." });
    return;
  }

  // App Home: create modal / refresh
  if (actionId === "wroket_open_create_modal" || actionId === "wroket_refresh_home") {
    const resolved = await resolveWroketUserFromSlack({ teamId, slackUserId });
    if ("error" in resolved) {
      res.status(200).json({ response_type: "ephemeral", text: resolved.error });
      return;
    }
    if (actionId === "wroket_open_create_modal" && payload.trigger_id) {
      await openSlackCreateTaskModalForUser({
        teamId,
        uid: resolved.uid,
        triggerId: payload.trigger_id,
      });
      res.status(200).json({});
      return;
    }
    res.status(200).json({});
    void refreshSlackAppHomeForUser({ teamId, slackUserId, uid: resolved.uid });
    return;
  }

  const timerAction = actionId ? actionIdToTimerAction(actionId) : null;
  if (timerAction) {
    const resolved = await resolveWroketUserFromSlack({ teamId, slackUserId });
    if ("error" in resolved) {
      res.status(200).json({ response_type: "ephemeral", text: resolved.error });
      return;
    }
    const parsedTimer =
      timerAction === "stop_timer"
        ? { todoId: "", targetUid: resolved.uid }
        : parseButtonValue(action?.value);
    if (!parsedTimer) {
      res.status(200).json({
        response_type: "ephemeral",
        text: "Bouton timer invalide.",
      });
      return;
    }
    const timerResult = await runSlackTimerButton({
      actorUid: resolved.uid,
      targetUid: parsedTimer.targetUid || resolved.uid,
      todoId: parsedTimer.todoId || undefined,
      action: timerAction,
    });
    res.status(200).json({
      response_type: "ephemeral",
      text: timerResult.message,
    });
    if (payload.view?.type === "home") {
      void refreshSlackAppHomeForUser({ teamId, slackUserId, uid: resolved.uid });
    } else if (timerResult.ok) {
      void updateMessageAfterAction({
        responseUrl: payload.response_url,
        originalBlocks: payload.message?.blocks,
        resultText: timerResult.message,
        ok: true,
      });
    }
    return;
  }

  const taskAction = actionId ? actionIdToTaskAction(actionId) : null;
  const parsed = parseButtonValue(action?.value);
  if (!taskAction || !parsed) {
    res.status(200).json({
      response_type: "ephemeral",
      text: "Action Wroket non reconnue.",
    });
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

  // Acknowledge quickly; update original message or App Home in background.
  res.status(200).json({
    response_type: "ephemeral",
    text: result.message,
  });

  if (payload.view?.type === "home") {
    void refreshSlackAppHomeForUser({ teamId, slackUserId, uid: resolved.uid });
  } else {
    void updateMessageAfterAction({
      responseUrl: payload.response_url,
      originalBlocks: payload.message?.blocks,
      resultText: result.message,
      ok: result.ok,
    });
  }
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
  const triggerId = params.get("trigger_id") ?? "";
  const text = (params.get("text") ?? "").trim();

  if (!teamId || !slackUserId) {
    res.status(200).json({ response_type: "ephemeral", text: "Payload slash incomplet." });
    return;
  }

  const resolved = await resolveWroketUserFromSlack({ teamId, slackUserId });
  if ("error" in resolved) {
    res.status(200).json({ response_type: "ephemeral", text: resolved.error });
    return;
  }

  const lower = text.toLowerCase();
  if (
    triggerId &&
    (lower === "modal" || lower === "add" || lower === "create" || lower === "new")
  ) {
    const opened = await openSlackCreateTaskModalForUser({
      teamId,
      uid: resolved.uid,
      triggerId,
    });
    if (opened) {
      res.status(200).send("");
      return;
    }
  }

  try {
    const verb = (text.split(/\s+/)[0] ?? "").toLowerCase();
    if (verb === "tasks" || verb === "list" || verb === "mine") {
      const lists = await loadTasksForTimerPicker(resolved.uid);
      const picker = buildSlackTasksTimerBlocks({
        uid: resolved.uid,
        personal: lists.personal,
        assigned: lists.assigned,
      });
      res.status(200).json({
        response_type: "ephemeral",
        text: picker.text,
        blocks: picker.blocks,
      });
      return;
    }

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

/**
 * POST /integrations/slack/events — Slack Events API (`url_verification`, `app_home_opened`, `app_mention`, IM `message`).
 */
export async function postSlackEvents(req: Request, res: Response): Promise<void> {
  const raw = verifyOrReject(req, res);
  if (raw === null) return;

  let body: {
    type?: string;
    challenge?: string;
    team_id?: string;
    event?: {
      type?: string;
      user?: string;
      bot_id?: string;
      subtype?: string;
      text?: string;
      channel?: string;
      channel_type?: string;
      ts?: string;
      thread_ts?: string;
    };
  };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    res.status(400).json({ error: "invalid_events_json" });
    return;
  }

  if (body.type === "url_verification") {
    res.status(200).json({ challenge: body.challenge ?? "" });
    return;
  }

  // Acknowledge within 3s
  res.status(200).json({ ok: true });

  // Avoid duplicate replies on Slack retry
  if (req.header("x-slack-retry-num")) {
    return;
  }

  const teamId = body.team_id ?? "";
  const ev = body.event;
  if (!teamId || !ev || ev.bot_id || ev.subtype) {
    return;
  }

  if (ev.type === "app_home_opened" && ev.user) {
    void refreshSlackAppHomeForUser({ teamId, slackUserId: ev.user });
    return;
  }

  if (
    (ev.type === "app_mention" || (ev.type === "message" && ev.channel_type === "im")) &&
    ev.user &&
    ev.channel
  ) {
    const token = resolveBotTokenForTeam(teamId);
    if (!token) return;
    const resolved = await resolveWroketUserFromSlack({ teamId, slackUserId: ev.user });
    if ("error" in resolved) {
      await postSlackChannelMessage({
        accessToken: token,
        channelId: ev.channel,
        text: resolved.error,
        threadTs: ev.thread_ts || (ev.type === "app_mention" ? ev.ts : undefined),
      });
      return;
    }
    const cleaned = (ev.text ?? "").replace(/<@[A-Z0-9]+>/gi, "").trim();
    const reply = await handleSlashText({
      actorUid: resolved.uid,
      text: cleaned || "help",
    });
    await postSlackChannelMessage({
      accessToken: token,
      channelId: ev.channel,
      text: reply || slashHelpText(),
      threadTs: ev.thread_ts || (ev.type === "app_mention" ? ev.ts : undefined),
    });
  }
}
