/**
 * Teams Bot Framework inbound — activities + Adaptive Card invoke/submit.
 * Expects JSON body; JWT verified via Authorization Bearer.
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
  // ChannelData / entities may include email in some tenants — best-effort.
  const name = activity.from?.name;
  if (name?.includes("@")) return name.trim().toLowerCase();
  return null;
}

/**
 * POST /integrations/teams/interactions — Bot Framework messaging endpoint.
 */
export async function postTeamsInteractions(req: Request, res: Response): Promise<void> {
  if (!(await verifyOrReject(req, res))) return;

  const activity = (typeof req.body === "object" && req.body ? req.body : {}) as TeamsActivity;

  // Bot Framework ping
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

  // Adaptive Card Action.Submit / invoke
  if (
    activity.type === "invoke" ||
    activity.type === "message" && activity.value && typeof activity.value === "object"
  ) {
    const submit = parseTeamsTaskSubmit(activity.value);
    if (submit) {
      const resolved = await resolveWroketUserFromTeams({
        aadObjectId: activity.from?.aadObjectId ?? activity.from?.id,
        email: extractEmailFromActivity(activity),
        tenantId,
      });
      if ("error" in resolved) {
        res.status(200).json({ type: "message", text: resolved.error });
        return;
      }
      const result = await runTeamsTaskAction({
        actorUid: resolved.uid,
        targetUid: submit.targetUid,
        todoId: submit.todoId,
        action: submit.action,
      });
      res.status(200).json({ type: "message", text: result.message });
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
      res.status(200).json({ type: "message", text: resolved.error });
      return;
    }
    try {
      const reply = await handleTeamsCommandText({ actorUid: resolved.uid, text: activity.text });
      res.status(200).json({ type: "message", text: reply || teamsSlashHelp() });
    } catch (err) {
      console.warn("[teams] command failed:", err);
      res.status(200).json({ type: "message", text: "Erreur lors du traitement de la commande." });
    }
    return;
  }

  res.status(200).json({});
}
