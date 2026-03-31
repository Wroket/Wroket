import { Response } from "express";

import { AuthenticatedRequest } from "./authController";
import {
  createTodo,
  deleteTodo,
  listTodos,
  listAssignedToMe,
  listArchivedTodos,
  updateTodo,
  canAccessTodo,
  batchReorder,
  CreateTodoInput,
  UpdateTodoInput,
} from "../services/todoService";
import { listComments, addComment, deleteComment, editComment, toggleReaction, parseMentions, getCommentCounts } from "../services/commentService";
import { findUserByEmail } from "../services/authService";
import { createNotification } from "../services/notificationService";
import { ForbiddenError, ValidationError } from "../utils/errors";
import { logActivity, getTaskActivity } from "../services/activityLogService";

export async function list(req: AuthenticatedRequest, res: Response) {
  const todos = listTodos(req.user!.uid);
  res.status(200).json(todos);
}

export async function assigned(req: AuthenticatedRequest, res: Response) {
  const todos = listAssignedToMe(req.user!.uid);
  res.status(200).json(todos);
}

export async function archived(req: AuthenticatedRequest, res: Response) {
  const todos = listArchivedTodos(req.user!.uid);
  res.status(200).json(todos);
}

export async function create(req: AuthenticatedRequest, res: Response) {
  const { title, priority, effort, estimatedMinutes, startDate, deadline, parentId, projectId, phaseId, assignedTo, recurrence } = req.body as Partial<CreateTodoInput>;
  if (!title || !priority) {
    throw new ValidationError("Titre et priorité requis");
  }

  const todo = createTodo(req.user!.uid, { title, priority, effort, estimatedMinutes, startDate, deadline, parentId, projectId, phaseId, assignedTo, recurrence });
  logActivity(req.user!.uid, req.user!.email, "create", "todo", todo.id, { title: todo.title });

  try {
    if (todo.assignedTo && todo.assignedTo !== req.user!.uid) {
      createNotification(
        todo.assignedTo,
        "task_assigned",
        "Tâche assignée",
        `${req.user!.email} vous a assigné la tâche "${todo.title}"`,
        { todoId: todo.id, assignerEmail: req.user!.email }
      );
    }
  } catch (err) {
    console.warn("[todo.create] notification failed:", err);
  }

  res.status(201).json(todo);
}

export async function update(req: AuthenticatedRequest, res: Response) {
  const id = req.params.id as string;
  const input = req.body as UpdateTodoInput;
  const previousTodo = listTodos(req.user!.uid).find((t) => t.id === id);
  const todo = updateTodo(req.user!.uid, id, input);

  try {
    if (
      input.assignedTo &&
      input.assignedTo !== req.user!.uid &&
      input.assignedTo !== previousTodo?.assignedTo
    ) {
      createNotification(
        input.assignedTo,
        "task_assigned",
        "Tâche assignée",
        `${req.user!.email} vous a assigné la tâche "${todo.title}"`,
        { todoId: todo.id, assignerEmail: req.user!.email }
      );
    }

    if (
      input.assignmentStatus === "declined" &&
      todo.assignedTo === req.user!.uid &&
      todo.userId !== req.user!.uid
    ) {
      createNotification(
        todo.userId,
        "task_declined",
        "Tâche refusée",
        `${req.user!.email} a refusé la tâche "${todo.title}"`,
        { todoId: todo.id, declinerEmail: req.user!.email }
      );
    }

    if (
      input.assignmentStatus === "accepted" &&
      todo.assignedTo === req.user!.uid &&
      todo.userId !== req.user!.uid
    ) {
      createNotification(
        todo.userId,
        "task_accepted",
        "Tâche acceptée",
        `${req.user!.email} a accepté la tâche "${todo.title}"`,
        { todoId: todo.id, accepterEmail: req.user!.email }
      );
    }

    if (
      input.status === "completed" &&
      todo.assignedTo &&
      todo.assignedTo === req.user!.uid &&
      todo.userId !== req.user!.uid
    ) {
      createNotification(
        todo.userId,
        "task_completed",
        "Tâche accomplie",
        `${req.user!.email} a terminé la tâche "${todo.title}"`,
        { todoId: todo.id, assigneeEmail: req.user!.email }
      );
    }
  } catch (err) {
    console.warn("[todo.update] notification failed:", err);
  }

  logActivity(req.user!.uid, req.user!.email, "update", "todo", todo.id, { title: todo.title });
  res.status(200).json(todo);
}

export async function remove(req: AuthenticatedRequest, res: Response) {
  const id = req.params.id as string;
  const todo = deleteTodo(req.user!.uid, id);
  logActivity(req.user!.uid, req.user!.email, "delete", "todo", todo.id, { title: todo.title });
  res.status(200).json(todo);
}

// ── Comments ──

/**
 * FIX: Verify the requesting user can access the todo before allowing
 * comment operations. Previously any authenticated user could read/write
 * comments on any task by supplying an arbitrary todoId.
 */

export async function getComments(req: AuthenticatedRequest, res: Response) {
  const todoId = req.params.id as string;
  if (!canAccessTodo(req.user!.uid, todoId)) {
    throw new ForbiddenError("Accès refusé à cette tâche");
  }
  res.status(200).json(listComments(todoId));
}

export async function postComment(req: AuthenticatedRequest, res: Response) {
  const todoId = req.params.id as string;
  if (!canAccessTodo(req.user!.uid, todoId)) {
    throw new ForbiddenError("Accès refusé à cette tâche");
  }
  const { text } = req.body as { text?: string };
  if (!text || typeof text !== "string") throw new ValidationError("Texte requis");
  const comment = addComment(todoId, req.user!.uid, req.user!.email, text);

  try {
    for (const email of parseMentions(text)) {
      if (email === req.user!.email) continue;
      const mentioned = findUserByEmail(email);
      if (mentioned) {
        createNotification(mentioned.uid, "comment_mention", "Mention dans un commentaire", `${req.user!.email} vous a mentionné dans un commentaire`, { todoId });
      }
    }
  } catch (err) {
    console.warn("[comment] mention notification failed:", err);
  }

  res.status(201).json(comment);
}

export async function removeComment(req: AuthenticatedRequest, res: Response) {
  const todoId = req.params.id as string;
  if (!canAccessTodo(req.user!.uid, todoId)) {
    throw new ForbiddenError("Accès refusé à cette tâche");
  }
  const commentId = req.params.commentId as string;
  deleteComment(todoId, commentId, req.user!.uid);
  res.status(200).json({ ok: true });
}

export async function editCommentHandler(req: AuthenticatedRequest, res: Response) {
  const todoId = req.params.id as string;
  if (!canAccessTodo(req.user!.uid, todoId)) {
    throw new ForbiddenError("Accès refusé à cette tâche");
  }
  const { text } = req.body as { text?: string };
  if (!text || typeof text !== "string") throw new ValidationError("Texte requis");
  const comment = editComment(todoId, req.params.commentId as string, req.user!.uid, text);

  try {
    for (const email of parseMentions(text)) {
      if (email === req.user!.email) continue;
      const mentioned = findUserByEmail(email);
      if (mentioned) {
        createNotification(mentioned.uid, "comment_mention", "Mention dans un commentaire", `${req.user!.email} vous a mentionné dans un commentaire`, { todoId });
      }
    }
  } catch (err) {
    console.warn("[comment] mention notification failed:", err);
  }

  res.status(200).json(comment);
}

export async function toggleReactionHandler(req: AuthenticatedRequest, res: Response) {
  const todoId = req.params.id as string;
  if (!canAccessTodo(req.user!.uid, todoId)) {
    throw new ForbiddenError("Accès refusé à cette tâche");
  }
  const { emoji } = req.body as { emoji?: string };
  if (!emoji || typeof emoji !== "string") throw new ValidationError("Emoji requis");
  const comment = toggleReaction(todoId, req.params.commentId as string, req.user!.uid, emoji);
  res.status(200).json(comment);
}

export async function commentCounts(req: AuthenticatedRequest, res: Response) {
  const todos = listTodos(req.user!.uid);
  const todoIds = todos.map((t) => t.id);
  res.status(200).json(getCommentCounts(todoIds));
}

export async function exportCsv(req: AuthenticatedRequest, res: Response) {
  const todos = listTodos(req.user!.uid);
  const header = "id,title,status,priority,effort,deadline,tags,projectId,createdAt\n";
  const rows = todos
    .map((t) => {
      const fields = [
        t.id,
        csvSafe(t.title ?? ""),
        t.status,
        t.priority ?? "",
        t.effort ?? "",
        t.deadline ?? "",
        csvSafe((t.tags ?? []).join(", ")),
        t.projectId ?? "",
        t.createdAt ?? "",
      ];
      return fields.join(",");
    })
    .join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=wroket-tasks.csv");
  res.send(header + rows);
}

const CSV_FORMULA_TRIGGERS = new Set(["=", "+", "-", "@", "\t", "\r"]);

/** Wraps value in double-quotes and neutralises formula injection triggers. */
function csvSafe(value: string): string {
  let v = value.replace(/"/g, '""');
  if (v.length > 0 && CSV_FORMULA_TRIGGERS.has(v[0])) {
    v = `'${v}`;
  }
  return `"${v}"`;
}

export async function taskActivity(req: AuthenticatedRequest, res: Response) {
  const todoId = req.params.id as string;
  if (!canAccessTodo(req.user!.uid, todoId)) throw new ForbiddenError("Accès refusé");
  const entries = getTaskActivity(todoId);
  res.status(200).json(entries);
}

export async function reorderTodos(req: AuthenticatedRequest, res: Response) {
  const { todoIds } = req.body as { todoIds?: string[] };
  if (!Array.isArray(todoIds)) throw new ValidationError("todoIds requis");
  const updated = batchReorder(req.user!.uid, todoIds);
  res.status(200).json({ message: "OK", updated });
}
