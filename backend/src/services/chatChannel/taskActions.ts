/**
 * Shared accept / decline / complete for chat buttons & slash commands.
 */

import { findUserByUid } from "../authService";
import { findTodoForUser, updateTodo } from "../todoService";
import { AppError, UnprocessableEntityError } from "../../utils/errors";
import { CHAT_ACTION_IDS, type ChatActionResult, type ChatTaskAction } from "./types";

export function parseButtonValue(raw: string | undefined): { todoId: string; targetUid: string } | null {
  if (!raw?.trim()) return null;
  const parts = raw.trim().split("|");
  if (parts.length !== 2) return null;
  const [todoId, targetUid] = parts;
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
    console.warn("[chat-channel] action failed:", err);
    return { ok: false, message: "Erreur lors de l’action Wroket." };
  }
}
