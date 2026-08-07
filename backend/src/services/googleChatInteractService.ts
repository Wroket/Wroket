/**
 * Google Chat+ inbound — cards v2 actions + slash / @Wroket commands.
 */

import {
  actionIdToTaskAction,
  handleSlashText,
  parseButtonValue,
  resolveUserFromChatEmail,
  runTaskAction,
  slashHelpTextForPrefix,
  type ChatTaskAction,
} from "./chatChannel";

export function googleChatSlashHelp(): string {
  return slashHelpTextForPrefix("@Wroket");
}

export function parseGoogleChatCardAction(raw: unknown): {
  action: ChatTaskAction;
  todoId: string;
  targetUid: string;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const params = (d.parameters ?? d) as Record<string, unknown>;
  const actionRaw =
    (typeof params.action === "string" && params.action) ||
    (typeof d.actionMethodName === "string" && d.actionMethodName) ||
    "";
  const action = actionIdToTaskAction(actionRaw);
  if (!action) return null;
  if (typeof params.value === "string") {
    const parsed = parseButtonValue(params.value);
    if (!parsed) return null;
    return { action, ...parsed };
  }
  const todoId = typeof params.todoId === "string" ? params.todoId : "";
  const targetUid = typeof params.targetUid === "string" ? params.targetUid : "";
  if (!todoId || !targetUid) return null;
  return { action, todoId, targetUid };
}

export async function resolveWroketUserFromGoogleChat(opts: {
  email?: string | null;
}): Promise<{ uid: string; email: string } | { error: string }> {
  return resolveUserFromChatEmail(opts.email, {
    unknownEmailHint:
      "Impossible de lire votre email Google Workspace. Vérifiez le profil Chat ou reconnectez Google Chat dans Paramètres.",
  });
}

export async function runGoogleChatTaskAction(opts: {
  actorUid: string;
  targetUid: string;
  todoId: string;
  action: ChatTaskAction;
}) {
  return runTaskAction(opts);
}

export async function handleGoogleChatCommandText(opts: {
  actorUid: string;
  text: string;
}): Promise<string> {
  let text = (opts.text ?? "").trim();
  text = text.replace(/^@?Wroket\s+/i, "").trim();
  text = text.replace(/^\/?wroket\s+/i, "").trim();
  if (/^\/?wroket$/i.test(text) || /^@?Wroket$/i.test(text)) text = "help";
  return handleSlashText({ actorUid: opts.actorUid, text, commandPrefix: "@Wroket" });
}
