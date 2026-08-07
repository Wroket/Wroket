/**
 * Slack Lot 3 — interactivity + slash command business logic.
 * Task actions / slash / identity email mapping live in `chatChannel/` (shared socle).
 */

import {
  actionIdToTaskAction,
  handleSlashText as handleSharedSlashText,
  parseButtonValue,
  resolveUserFromChatEmail,
  runTaskAction,
  slashHelpTextForPrefix,
  type ChatActionResult,
  type ChatTaskAction,
} from "./chatChannel";
import {
  fetchSlackUserEmail,
  postSlackResponseUrl,
  resolveBotTokenForTeam,
} from "./slackApiService";

export type SlackTaskAction = ChatTaskAction;
export type SlackActionResult = ChatActionResult;

export { parseButtonValue, actionIdToTaskAction };

/**
 * Map Slack user → Wroket user via email (users.info + findUserByEmail).
 */
export async function resolveWroketUserFromSlack(opts: {
  teamId: string;
  slackUserId: string;
}): Promise<{ uid: string; email: string } | { error: string }> {
  const token = resolveBotTokenForTeam(opts.teamId);
  if (!token) {
    return {
      error:
        "Aucun workspace Slack Wroket trouvé pour cette équipe. Un utilisateur doit connecter Slack dans Paramètres → Intégrations.",
    };
  }
  const email = await fetchSlackUserEmail(token, opts.slackUserId);
  return resolveUserFromChatEmail(email, {
    unknownEmailHint:
      "Impossible de lire votre email Slack. Reconnectez l’app Wroket avec le scope users:read.email, et vérifiez que votre email est visible dans Slack.",
  });
}

/**
 * Run accept / decline / complete — shared `runTaskAction` (Slack re-export).
 */
export async function runSlackTaskAction(opts: {
  actorUid: string;
  targetUid: string;
  todoId: string;
  action: SlackTaskAction;
}): Promise<SlackActionResult> {
  return runTaskAction(opts);
}

export function slashHelpText(): string {
  return slashHelpTextForPrefix("/wroket");
}

export async function handleSlashText(opts: {
  actorUid: string;
  text: string;
}): Promise<string> {
  return handleSharedSlashText({ ...opts, commandPrefix: "/wroket" });
}

/** Strip action blocks from a Slack message after a successful click. */
export function stripActionBlocks(blocks: unknown): unknown[] {
  if (!Array.isArray(blocks)) return [];
  return blocks.filter((b) => {
    if (!b || typeof b !== "object") return true;
    return (b as { type?: string }).type !== "actions";
  });
}

export async function updateMessageAfterAction(opts: {
  responseUrl?: string;
  originalBlocks?: unknown;
  resultText: string;
  ok: boolean;
}): Promise<void> {
  if (!opts.responseUrl) return;
  const kept = stripActionBlocks(opts.originalBlocks);
  const blocks = [
    ...kept,
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: opts.ok ? `✅ ${opts.resultText}` : `⚠️ ${opts.resultText}`,
        },
      ],
    },
  ];
  await postSlackResponseUrl(opts.responseUrl, {
    replace_original: true,
    text: opts.resultText,
    blocks,
  });
}
