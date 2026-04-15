/**
 * Normalise les métadonnées optionnelles des notifications pour le formatage
 * webhooks (Slack, Teams, Google Chat, Discord) et emails.
 */
export interface NormalizedNotificationContext {
  todoTitle?: string;
  actorEmail?: string;
  recipientEmail?: string;
  projectName?: string;
  teamName?: string;
  commentPreview?: string;
  todoId?: string;
}

export function normalizeNotificationData(data?: Record<string, string>): NormalizedNotificationContext {
  if (!data) return {};
  const actor =
    data.actorEmail ||
    data.assignerEmail ||
    data.declinerEmail ||
    data.accepterEmail ||
    data.assigneeEmail ||
    data.inviterEmail ||
    data.acceptedByEmail ||
    data.declinedByEmail;
  return {
    todoTitle: data.todoTitle,
    actorEmail: actor,
    recipientEmail: data.recipientEmail,
    projectName: data.projectName,
    teamName: data.teamName,
    commentPreview: data.commentPreview,
    todoId: data.todoId,
  };
}

/** Bloc détaillé (champs structurés) — pas seulement destinataire ou todoId seul. */
export function shouldUseRichLayout(data?: Record<string, string>): boolean {
  const ctx = normalizeNotificationData(data);
  return !!(
    ctx.todoTitle ||
    ctx.actorEmail ||
    ctx.projectName ||
    ctx.teamName ||
    ctx.commentPreview
  );
}

export function escapeSlackMrkdwn(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function taskDeepLink(todoId?: string): string | undefined {
  if (!todoId) return undefined;
  const base = (process.env.FRONTEND_URL || "https://wroket.com").replace(/\/$/, "");
  return `${base}/todos?task=${encodeURIComponent(todoId)}`;
}
