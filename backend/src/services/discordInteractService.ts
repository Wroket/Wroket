/**
 * Discord+ interactions — slash commands + message components.
 */

import { findUserByUid } from "./authService";
import {
  actionIdToTaskAction,
  handleSlashText,
  parseButtonValue,
  resolveUserFromChatEmail,
  runTaskAction,
  slashHelpTextForPrefix,
  type ChatTaskAction,
} from "./chatChannel";
import { getDiscordLinkForDiscordUser } from "./discordConnectionService";

export function discordSlashHelp(): string {
  return slashHelpTextForPrefix("/wroket");
}

export function parseDiscordCustomId(customId: string | undefined): {
  action: ChatTaskAction;
  todoId: string;
  targetUid: string;
} | null {
  if (!customId?.trim()) return null;
  // Format: wroket_accept:todoId|targetUid  OR  wroket_accept|todoId|targetUid
  const raw = customId.trim();
  const colon = raw.indexOf(":");
  if (colon > 0) {
    const action = actionIdToTaskAction(raw.slice(0, colon));
    const parsed = parseButtonValue(raw.slice(colon + 1));
    if (!action || !parsed) return null;
    return { action, ...parsed };
  }
  const parts = raw.split("|");
  if (parts.length === 3) {
    const action = actionIdToTaskAction(parts[0]!);
    if (!action) return null;
    return { action, todoId: parts[1]!, targetUid: parts[2]! };
  }
  return null;
}

export async function resolveWroketUserFromDiscord(opts: {
  discordUserId: string;
  email?: string | null;
}): Promise<{ uid: string; email: string } | { error: string }> {
  if (opts.email) {
    const byEmail = resolveUserFromChatEmail(opts.email);
    if (!("error" in byEmail)) return byEmail;
  }
  const link = getDiscordLinkForDiscordUser(opts.discordUserId);
  if (link) {
    const user = findUserByUid(link.wroketUid);
    if (user?.email) return { uid: user.uid, email: user.email };
  }
  return {
    error:
      "Aucun compte Wroket lié à Discord. Utilisez un email Discord identique à Wroket, ou liez le compte dans Paramètres → Intégrations.",
  };
}

export async function runDiscordTaskAction(opts: {
  actorUid: string;
  targetUid: string;
  todoId: string;
  action: ChatTaskAction;
}) {
  return runTaskAction(opts);
}

export async function handleDiscordCommandText(opts: {
  actorUid: string;
  text: string;
}): Promise<string> {
  return handleSlashText({
    actorUid: opts.actorUid,
    text: opts.text,
    commandPrefix: "/wroket",
  });
}
