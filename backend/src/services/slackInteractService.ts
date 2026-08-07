/**
 * Slack Lot 3 — interactivity + slash command business logic.
 */

import { findUserByEmail, findUserByUid } from "./authService";
import {
  fetchSlackUserEmail,
  postSlackResponseUrl,
  resolveBotTokenForTeam,
} from "./slackApiService";
import { findTodoForUser, listAssignedToMe, listTodos, updateTodo, type Todo } from "./todoService";
import { taskDeepLink } from "./notificationFormatting";
import { AppError, UnprocessableEntityError } from "../utils/errors";

export type SlackTaskAction = "accept" | "decline" | "complete";

export function parseButtonValue(raw: string | undefined): { todoId: string; targetUid: string } | null {
  if (!raw?.trim()) return null;
  const parts = raw.trim().split("|");
  if (parts.length !== 2) return null;
  const [todoId, targetUid] = parts;
  if (!todoId || !targetUid) return null;
  return { todoId, targetUid };
}

export function actionIdToTaskAction(actionId: string): SlackTaskAction | null {
  if (actionId === "wroket_accept") return "accept";
  if (actionId === "wroket_decline") return "decline";
  if (actionId === "wroket_complete") return "complete";
  return null;
}

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
  if (!email) {
    return {
      error:
        "Impossible de lire votre email Slack. Reconnectez l’app Wroket avec le scope users:read.email, et vérifiez que votre email est visible dans Slack.",
    };
  }
  const user = findUserByEmail(email);
  if (!user) {
    return {
      error: `Aucun compte Wroket pour ${email}. Utilisez le même email que votre compte Wroket.`,
    };
  }
  return { uid: user.uid, email: user.email };
}

export type SlackActionResult =
  | { ok: true; message: string; todoTitle: string }
  | { ok: false; message: string };

/**
 * Run accept / decline / complete for the resolved Wroket user.
 * `targetUid` from the button must match the clicker's Wroket uid (email identity).
 */
export async function runSlackTaskAction(opts: {
  actorUid: string;
  targetUid: string;
  todoId: string;
  action: SlackTaskAction;
}): Promise<SlackActionResult> {
  if (opts.actorUid !== opts.targetUid) {
    return {
      ok: false,
      message: "Cette action est destinée à un autre utilisateur Wroket (email Slack ≠ destinataire).",
    };
  }

  const user = findUserByUid(opts.actorUid);
  if (!user?.email) {
    return { ok: false, message: "Compte Wroket introuvable." };
  }

  const found = await findTodoForUser(opts.actorUid, opts.todoId);
  if (!found) {
    return { ok: false, message: "Tâche introuvable ou accès refusé." };
  }
  const todo = found.todo;

  try {
    if (opts.action === "accept" || opts.action === "decline") {
      if (todo.assignedTo !== opts.actorUid) {
        return { ok: false, message: "Vous n’êtes pas l’assigné de cette tâche." };
      }
      if (todo.assignmentStatus !== "pending") {
        return {
          ok: false,
          message: `Assignation déjà traitée (${todo.assignmentStatus ?? "aucune"}).`,
        };
      }
      await updateTodo(opts.actorUid, user.email, opts.todoId, {
        assignmentStatus: opts.action === "accept" ? "accepted" : "declined",
      });
      return {
        ok: true,
        todoTitle: todo.title,
        message:
          opts.action === "accept"
            ? `Tâche « ${todo.title} » acceptée.`
            : `Tâche « ${todo.title} » refusée.`,
      };
    }

    // complete
    if (todo.status !== "active") {
      return { ok: false, message: `La tâche n’est plus active (${todo.status}).` };
    }
    const canComplete = todo.userId === opts.actorUid || todo.assignedTo === opts.actorUid;
    if (!canComplete) {
      return { ok: false, message: "Vous ne pouvez pas terminer cette tâche." };
    }
    await updateTodo(opts.actorUid, user.email, opts.todoId, { status: "completed" });
    return {
      ok: true,
      todoTitle: todo.title,
      message: `Tâche « ${todo.title} » terminée.`,
    };
  } catch (err) {
    if (err instanceof UnprocessableEntityError && err.code === "TASK_BLOCKED_BY_ACTIVE") {
      const blockers = (err.details as { blockers?: Array<{ title: string }> } | undefined)?.blockers;
      const titles = blockers?.map((b) => b.title).slice(0, 3).join(", ") ?? "dépendances";
      return {
        ok: false,
        message: `Impossible de terminer : bloquée par ${titles}.`,
      };
    }
    if (err instanceof AppError) {
      return { ok: false, message: err.message };
    }
    console.warn("[slack-interact] action failed:", err);
    return { ok: false, message: "Erreur lors de l’action Wroket." };
  }
}

const SLASH_HELP = [
  "*Commandes `/wroket`*",
  "`/wroket help` — cette aide",
  "`/wroket tasks` — vos tâches actives (personnelles + assignées)",
  "`/wroket open <todoId>` — détail + lien",
  "`/wroket accept <todoId>` — accepter une assignation",
  "`/wroket decline <todoId>` — refuser",
  "`/wroket complete <todoId>` — terminer",
].join("\n");

export function slashHelpText(): string {
  return SLASH_HELP;
}

function formatTodoLine(todo: Todo): string {
  const asg = todo.assignmentStatus ? ` · ${todo.assignmentStatus}` : "";
  return `• *${todo.title}* \`${todo.id}\`${asg}`;
}

export async function handleSlashText(opts: {
  actorUid: string;
  text: string;
}): Promise<string> {
  const raw = (opts.text ?? "").trim();
  const [cmd, ...rest] = raw.length === 0 ? ["help"] : raw.split(/\s+/);
  const arg = rest.join(" ").trim();
  const verb = cmd.toLowerCase();

  if (verb === "help" || verb === "?" || verb === "aide") {
    return slashHelpText();
  }

  if (verb === "tasks" || verb === "list" || verb === "mine") {
    const [mine, assigned] = await Promise.all([
      listTodos(opts.actorUid),
      listAssignedToMe(opts.actorUid),
    ]);
    const personal = mine.filter((t) => t.status === "active").slice(0, 10);
    const assignedActive = assigned.filter((t) => t.status === "active").slice(0, 10);

    if (personal.length === 0 && assignedActive.length === 0) {
      return "Aucune tâche active (personnelle ou assignée).";
    }

    const sections: string[] = [];
    if (personal.length > 0) {
      sections.push(`*Personnelles* (${personal.length}) :`, ...personal.map(formatTodoLine));
    }
    if (assignedActive.length > 0) {
      sections.push(`*Assignées à vous* (${assignedActive.length}) :`, ...assignedActive.map(formatTodoLine));
    } else {
      sections.push("_Aucune tâche assignée par quelqu’un d’autre._");
    }
    return sections.join("\n");
  }

  if (verb === "open") {
    if (!arg) return "Usage : `/wroket open <todoId>`";
    const found = await findTodoForUser(opts.actorUid, arg);
    if (!found) return "Tâche introuvable ou accès refusé.";
    const t = found.todo;
    const link = taskDeepLink(t.id);
    const lines = [
      `*${t.title}*`,
      `Id : \`${t.id}\``,
      `Statut : ${t.status}`,
      t.assignmentStatus ? `Assignation : ${t.assignmentStatus}` : null,
      link ? `<${link}|Ouvrir dans Wroket>` : null,
    ].filter(Boolean);
    return lines.join("\n");
  }

  if (verb === "accept" || verb === "decline" || verb === "complete") {
    if (!arg) return `Usage : \`/wroket ${verb} <todoId>\``;
    const result = await runSlackTaskAction({
      actorUid: opts.actorUid,
      targetUid: opts.actorUid,
      todoId: arg,
      action: verb,
    });
    return result.message;
  }

  return `Commande inconnue « ${cmd} ».\n\n${slashHelpText()}`;
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
