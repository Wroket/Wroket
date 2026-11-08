/**
 * Shared accept / decline / complete for chat buttons & slash commands.
 */

import { findUserByUid } from "../authService";
import { findTodoForUser, updateTodo } from "../todoService";
import { AppError, UnprocessableEntityError } from "../../utils/errors";
import { CHAT_ACTION_IDS, type ChatActionResult, type ChatTaskAction } from "./types";

/**
 * Normalize a todo id pasted from chat (backticks, quotes, zero-width, fancy dashes).
 */
export function normalizeChatTodoId(raw: string): string {
  return raw
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/^[`'"<\[(]+|[`'">\])]+$/g, "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .trim();
}

export function parseButtonValue(raw: string | undefined): { todoId: string; targetUid: string } | null {
  if (!raw?.trim()) return null;
  const parts = raw.trim().split("|");
  if (parts.length !== 2) return null;
  const todoId = normalizeChatTodoId(parts[0] ?? "");
  const targetUid = (parts[1] ?? "").trim();
  if (!todoId || !targetUid) return null;
  return { todoId, targetUid };
}

export function actionIdToTaskAction(actionId: string): ChatTaskAction | null {
  if (actionId === CHAT_ACTION_IDS.accept || actionId === "accept") return "accept";
  if (actionId === CHAT_ACTION_IDS.decline || actionId === "decline") return "decline";
  if (actionId === CHAT_ACTION_IDS.complete || actionId === "complete") return "complete";
  return null;
}

/**
 * Run accept / decline / complete for the resolved Wroket user.
 * `targetUid` from the button must match the clicker's Wroket uid (email identity).
 */
export async function runTaskAction(opts: {
  actorUid: string;
  targetUid: string;
  todoId: string;
  action: ChatTaskAction;
}): Promise<ChatActionResult> {
  if (opts.actorUid !== opts.targetUid) {
    return {
      ok: false,
      message: "Cette action est destinée à un autre utilisateur Wroket (email canal ≠ destinataire).",
    };
  }

  const user = findUserByUid(opts.actorUid);
  if (!user?.email) {
    return { ok: false, message: "Compte Wroket introuvable." };
  }

  const todoId = normalizeChatTodoId(opts.todoId);
  if (!todoId) {
    return { ok: false, message: "Identifiant de tâche manquant." };
  }

  const found = await findTodoForUser(opts.actorUid, todoId, user.email);
  if (!found) {
    return {
      ok: false,
      message: `Tâche introuvable pour \`${todoId}\` (ou accès refusé). Vérifiez l’id via \`/wroket tasks\` ou \`/wroket open <id>\`.`,
    };
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
      const nextStatus = opts.action === "accept" ? "accepted" : "declined";
      await updateTodo(opts.actorUid, user.email, todoId, {
        assignmentStatus: nextStatus,
      });
      // Mirror HTTP update: notify owner once (pending → terminal only; guarded above).
      if (todo.userId && todo.userId !== opts.actorUid) {
        const { createNotification, resolveTaskAssignedNotifications } = await import(
          "../notificationService"
        );
        resolveTaskAssignedNotifications(opts.actorUid, todo.id, nextStatus);
        if (nextStatus === "accepted") {
          createNotification(
            todo.userId,
            "task_accepted",
            "Tâche acceptée",
            `${user.email} a accepté la tâche "${todo.title}"`,
            {
              todoId: todo.id,
              todoTitle: todo.title,
              accepterEmail: user.email,
              actorEmail: user.email,
            },
          );
        } else {
          createNotification(
            todo.userId,
            "task_declined",
            "Tâche refusée",
            `${user.email} a refusé la tâche "${todo.title}"`,
            {
              todoId: todo.id,
              todoTitle: todo.title,
              declinerEmail: user.email,
              actorEmail: user.email,
            },
          );
        }
      }
      return {
        ok: true,
        todoTitle: todo.title,
        message:
          opts.action === "accept"
            ? `Tâche « ${todo.title} » acceptée.`
            : `Tâche « ${todo.title} » refusée.`,
      };
    }

    if (todo.status !== "active") {
      return { ok: false, message: `La tâche n’est plus active (${todo.status}).` };
    }
    const canComplete = todo.userId === opts.actorUid || todo.assignedTo === opts.actorUid;
    if (!canComplete) {
      return { ok: false, message: "Vous ne pouvez pas terminer cette tâche." };
    }
    await updateTodo(opts.actorUid, user.email, todoId, { status: "completed" });
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
    console.warn("[chat-channel] action failed:", err);
    return { ok: false, message: "Erreur lors de l’action Wroket." };
  }
}
