/**
 * Teams Bot Framework inbound — activities + Adaptive Card invoke/submit.
 * Expects JSON body; JWT verified via Authorization Bearer.
 * Replies go via Bot Connector (serviceUrl), not the HTTP response body.
 */

import { Request, Response } from "express";

import {
  getTeamsBotAppId,
  isTeamsSigningConfigured,
  verifyTeamsBotJwt,
} from "../services/teamsSignature";
import {
  handleTeamsCommandText,
  parseTeamsTaskSubmit,
  rememberTeamsConversation,
  resolveWroketUserFromTeams,
  runTeamsTaskAction,
  teamsSlashHelp,
} from "../services/teamsInteractService";
import { replyTeamsText } from "../services/teamsApiService";

function authHeader(req: Request): string | undefined {
  const h = req.header("authorization") ?? req.header("Authorization");
  return h ?? undefined;
}

async function verifyOrReject(req: Request, res: Response): Promise<boolean> {
  if (!isTeamsSigningConfigured()) {
    console.error("[teams] TEAMS_BOT_APP_ID missing — rejecting inbound");
    res.status(503).json({ error: "teams_bot_not_configured" });
    return false;
  }
  const ok = await verifyTeamsBotJwt(authHeader(req), getTeamsBotAppId());
  if (!ok) {
    res.status(401).json({ error: "invalid_teams_jwt" });
    return false;
  }
  return true;
}

interface TeamsActivity {
  id?: string;
  type?: string;
  text?: string;
  name?: string;
  value?: unknown;
  from?: { id?: string; aadObjectId?: string; name?: string };
  conversation?: { id?: string; tenantId?: string; conversationType?: string };
  channelData?: { tenant?: { id?: string }; channel?: { id?: string } };
  serviceUrl?: string;
  recipient?: { id?: string };
}

function extractEmailFromActivity(activity: TeamsActivity): string | null {
  // Bot Framework rarely sends email on channel messages; AAD id is primary.
  const name = activity.from?.name;
  if (name?.includes("@")) return name.trim().toLowerCase();
  return null;
}

async function sendReply(activity: TeamsActivity, text: string): Promise<void> {
  const ok = await replyTeamsText({
    serviceUrl: activity.serviceUrl,
    conversationId: activity.conversation?.id,
    replyToId: activity.id,
    text,
  });
  if (!ok) {
    console.warn("[teams] connector reply failed — user may see no response in chat");
  }
}

function ackInvoke(res: Response): void {
  res.status(200).json({
    statusCode: 200,
    type: "invokeResponse",
    value: { status: 200, body: null },
  });
}

/**
 * POST /integrations/teams/interactions — Bot Framework messaging endpoint.
 */
export async function postTeamsInteractions(req: Request, res: Response): Promise<void> {
  if (!(await verifyOrReject(req, res))) return;

  const activity = (typeof req.body === "object" && req.body ? req.body : {}) as TeamsActivity;

  // Bot Framework ping / install
  if (activity.type === "conversationUpdate" || activity.type === "installationUpdate") {
    const tenantId = activity.channelData?.tenant?.id ?? activity.conversation?.tenantId ?? "";
    if (tenantId && activity.conversation?.id && activity.serviceUrl) {
      rememberTeamsConversation({
        tenantId,
        conversationId: activity.conversation.id,
        serviceUrl: activity.serviceUrl,
        channelId: activity.channelData?.channel?.id,
        userEmail: extractEmailFromActivity(activity) ?? undefined,
      });
    }
    res.status(200).json({});
    return;
  }

  const tenantId = activity.channelData?.tenant?.id ?? activity.conversation?.tenantId ?? "";
  const isInvoke = activity.type === "invoke";

  // Adaptive Card Action.Submit / invoke
  if (
    isInvoke ||
    (activity.type === "message" && activity.value && typeof activity.value === "object")
  ) {
    const submit = parseTeamsTaskSubmit(activity.value);
    if (submit) {
      const resolved = await resolveWroketUserFromTeams({
        aadObjectId: activity.from?.aadObjectId ?? activity.from?.id,
        email: extractEmailFromActivity(activity),
        tenantId,
      });
      const text =
        "error" in resolved
          ? resolved.error
          : (
              await runTeamsTaskAction({
                actorUid: resolved.uid,
                targetUid: submit.targetUid,
                todoId: submit.todoId,
                action: submit.action,
              })
            ).message;
      await sendReply(activity, text);
      if (isInvoke) {
        ackInvoke(res);
        return;
      }
      res.status(200).json({});
      return;
    }
    if (isInvoke) {
      ackInvoke(res);
      return;
    }
  }

  // Text / slash-style commands
  if (activity.type === "message" && activity.text?.trim()) {
    if (activity.conversation?.id && activity.serviceUrl && tenantId) {
      rememberTeamsConversation({
        tenantId,
        conversationId: activity.conversation.id,
        serviceUrl: activity.serviceUrl,
        channelId: activity.channelData?.channel?.id,
        userEmail: extractEmailFromActivity(activity) ?? undefined,
      });
    }

    const resolved = await resolveWroketUserFromTeams({
      aadObjectId: activity.from?.aadObjectId ?? activity.from?.id,
      email: extractEmailFromActivity(activity),
      tenantId,
    });
    if ("error" in resolved) {
      await sendReply(activity, resolved.error);
      res.status(200).json({});
      return;
    }
    try {
      const reply = await handleTeamsCommandText({ actorUid: resolved.uid, text: activity.text });
      await sendReply(activity, reply || teamsSlashHelp());
    } catch (err) {
      console.warn("[teams] command failed:", err);
      await sendReply(activity, "Erreur lors du traitement de la commande.");
    }
    res.status(200).json({});
    return;
  }

  res.status(200).json({});
}
