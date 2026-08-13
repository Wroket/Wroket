/**
 * Teams+ inbound — Adaptive Card actions + /wroket-style message commands.
 */

import {
  actionIdToTaskAction,
  handleSlashText,
  parseButtonValue,
  resolveUserFromChatEmail,
  runTaskAction,
  slashHelpTextForPrefix,
  type ChatChannelAdapter,
  type ChatTaskAction,
} from "./chatChannel";
import { getTeamsConnectionForTenant, upsertTeamsConnection } from "./teamsConnectionService";
import { findUserByEmail } from "./authService";

export function teamsSlashHelp(): string {
  return slashHelpTextForPrefix("/wroket");
}

/**
 * Parse Adaptive Card Action.Submit data or invoke value.
 */
export function parseTeamsTaskSubmit(data: unknown): {
  action: ChatTaskAction;
  todoId: string;
  targetUid: string;
} | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const actionRaw =
    (typeof d.action === "string" && d.action) ||
    (typeof d.actionId === "string" && d.actionId) ||
    "";
  const action = actionIdToTaskAction(actionRaw);
  if (!action) return null;

  if (typeof d.value === "string") {
    const parsed = parseButtonValue(d.value);
    if (!parsed) return null;
    return { action, ...parsed };
  }
  const todoId = typeof d.todoId === "string" ? d.todoId : "";
  const targetUid = typeof d.targetUid === "string" ? d.targetUid : "";
  if (!todoId || !targetUid) return null;
  return { action, todoId, targetUid };
}

export async function resolveWroketUserFromTeams(opts: {
  aadObjectId?: string;
  email?: string | null;
  tenantId?: string;
}): Promise<{ uid: string; email: string } | { error: string }> {
  if (opts.email) {
    return resolveUserFromChatEmail(opts.email, {
      unknownEmailHint:
        "Impossible de lire votre email Azure AD. Vérifiez le profil Entra ou reconnectez Teams dans Paramètres.",
    });
  }
  // Fallback: connection owner for tenant (1:1 install) — prefer email identity.
  if (opts.tenantId) {
    const conn = getTeamsConnectionForTenant(opts.tenantId);
    if (conn?.ownerEmail) {
      return resolveUserFromChatEmail(conn.ownerEmail);
    }
  }
  return {
    error:
      "Identité Teams introuvable. Connectez Teams dans Paramètres → Intégrations avec le même email que Wroket.",
  };
}

export async function runTeamsTaskAction(opts: {
  actorUid: string;
  targetUid: string;
  todoId: string;
  action: ChatTaskAction;
}) {
  return runTaskAction(opts);
}

export async function handleTeamsCommandText(opts: {
  actorUid: string;
  text: string;
}): Promise<string> {
  let text = (opts.text ?? "").trim();
  // Strip bot mention / command prefix
  text = text.replace(/^<at>[^<]*<\/at>\s*/i, "").trim();
  text = text.replace(/^\/?wroket\s+/i, "").trim();
  if (/^\/?wroket$/i.test(text)) text = "help";
  return handleSlashText({ actorUid: opts.actorUid, text, commandPrefix: "/wroket" });
}

/**
 * Persist conversation reference when the bot is added / messaged (enables proactive posts).
 * Prefer activity email; otherwise attach to the existing OAuth connection for this tenant.
 */
export function rememberTeamsConversation(opts: {
  tenantId: string;
  conversationId: string;
  serviceUrl: string;
  channelId?: string;
  userEmail?: string;
}): void {
  if (opts.userEmail) {
    const user = findUserByEmail(opts.userEmail);
    if (user) {
      upsertTeamsConnection({
        ownerUid: user.uid,
        ownerEmail: user.email,
        tenantId: opts.tenantId,
        conversationId: opts.conversationId,
        serviceUrl: opts.serviceUrl,
        channelId: opts.channelId,
      });
      return;
    }
  }
  // Channel messages often omit email — still store conversation on the tenant owner.
  const conn = getTeamsConnectionForTenant(opts.tenantId);
  if (!conn) return;
  upsertTeamsConnection({
    ownerUid: conn.ownerUid,
    ownerEmail: conn.ownerEmail,
    tenantId: opts.tenantId,
    conversationId: opts.conversationId,
    serviceUrl: opts.serviceUrl,
    channelId: opts.channelId,
  });
}

/** Adapter stub for documentation / future DI. */
export const teamsChannelAdapter: Pick<ChatChannelAdapter, "parseInteraction"> = {
  parseInteraction(raw: unknown) {
    const submit = parseTeamsTaskSubmit(raw);
    if (!submit) return { kind: "ignored" };
    return {
      kind: "task_action",
      action: submit.action,
      todoId: submit.todoId,
      targetUid: submit.targetUid,
    };
  },
};
