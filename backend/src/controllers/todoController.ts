import { Response } from "express";

import { AuthenticatedRequest } from "./authController";
import {
  createTodo,
  deleteTodo,
  todoToClientJson,
  listTodos,
  listAssignedToMe,
  listArchivedTodos,
  listArchivedTodosAssignedToMe,
  updateTodo,
  findTodoForUser,
  canAccessTodo,
  batchReorder,
  listProjectTodos,
  CreateTodoInput,
  UpdateTodoInput,
} from "../services/todoService";
import { listComments, addComment, deleteComment, editComment, toggleReaction, parseMentions, getCommentCounts } from "../services/commentService";
import { findUserByEmail } from "../services/authService";
import { createNotification } from "../services/notificationService";
import { deleteGoogleCalendarEventForTodo } from "../services/googleCalendarService";
import { getProjectById, listProjects } from "../services/projectService";
import { ForbiddenError, ValidationError } from "../utils/errors";
import { logActivity, getTaskActivity } from "../services/activityLogService";
import {
  parseTaskImportBuffer,
  coerceImportRowToCreateInput,
  previewTaskImportRows,
  executeTaskImport,
} from "../services/taskImportService";

const TERMINAL_STATUSES = new Set(["completed", "cancelled", "deleted"]);

export async function list(req: AuthenticatedRequest, res: Response) {
  const todos = listTodos(req.user!.uid);
  res.status(200).json(todos);
}

export async function assigned(req: AuthenticatedRequest, res: Response) {
  const todos = listAssignedToMe(req.user!.uid);
  res.status(200).json(todos);
}

export async function archived(req: AuthenticatedRequest, res: Response) {
  const uid = req.user!.uid;
  const email = req.user!.email ?? "";
  const own = listArchivedTodos(uid, email);
  const asAssignee = listArchivedTodosAssignedToMe(uid, email);
  const byId = new Map<string, (typeof own)[number]>();
  for (const t of own) byId.set(t.id, t);
  for (const t of asAssignee) byId.set(t.id, t);
  const merged = Array.from(byId.values()).sort(
    (a, b) => new Date(b.statusChangedAt).getTime() - new Date(a.statusChangedAt).getTime()
  );
  res.status(200).json(merged);
}

export async function create(req: AuthenticatedRequest, res: Response) {
  const { title, priority, effort, estimatedMinutes, startDate, deadline, parentId, projectId, phaseId, assignedTo, recurrence, tags } = req.body as Partial<CreateTodoInput>;
  if (typeof title !== "string" || typeof priority !== "string") {
    throw new ValidationError("Titre et priorité requis (chaînes)");
  }
  if (!title.trim() || !priority.trim()) {
    throw new ValidationError("Titre et priorité requis");
  }

  const todo = createTodo(req.user!.uid, req.user!.email ?? "", {
    title,
    priority,
    effort,
    estimatedMinutes,
    startDate,
    deadline,
    parentId,
    projectId,
    phaseId,
    assignedTo,
    recurrence,
    tags,
  });
  try {
    logActivity(req.user!.uid, req.user!.email ?? "", "create", "todo", todo.id, { todoId: todo.id });
  } catch (err) {
    console.warn("[todo.create] activity log failed:", err);
  }

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

  res.status(201).json(todoToClientJson(todo));
}

export async function update(req: AuthenticatedRequest, res: Response) {
  const id = req.params.id as string;
  const input = req.body as UpdateTodoInput;
  const prevFound = findTodoForUser(req.user!.uid, id);
  const previousTodo = prevFound?.todo ? { ...prevFound.todo } : null;
  const todo = updateTodo(req.user!.uid, req.user!.email ?? "", id, input);

  if (
    input.status &&
    TERMINAL_STATUSES.has(input.status) &&
    todo.scheduledSlot &&
    new Date(todo.scheduledSlot.start).getTime() > Date.now()
  ) {
    deleteGoogleCalendarEventForTodo(todo).catch((err) => {
      console.warn("[todo.update] Google Calendar event cleanup failed:", err);
    });
    updateTodo(req.user!.uid, req.user!.email ?? "", id, { scheduledSlot: null });
    todo.scheduledSlot = null;
  }

  try {
    if (
      input.assignedTo !== undefined &&
      previousTodo?.assignedTo &&
      previousTodo.assignedTo !== req.user!.uid &&
      input.assignedTo !== previousTodo.assignedTo
    ) {
      createNotification(
        previousTodo.assignedTo,
        "task_assigned",
        "Tâche réassignée",
        `${req.user!.email} vous a retiré de la tâche "${todo.title}"`,
        { todoId: todo.id }
      );
    }

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
        "Tâche archivée par l'assigné",
        `${req.user!.email} a archivé la tâche « ${todo.title} » (terminée)`,
        { todoId: todo.id, assigneeEmail: req.user!.email }
      );
    }

    if (
      input.status === "cancelled" &&
      todo.assignedTo &&
      todo.assignedTo === req.user!.uid &&
      todo.userId !== req.user!.uid
    ) {
      createNotification(
        todo.userId,
        "task_cancelled",
        "Tâche annulée par l'assigné",
        `${req.user!.email} a annulé la tâche « ${todo.title} »`,
        { todoId: todo.id, assigneeEmail: req.user!.email }
      );
    }

    if (input.status === "completed" && todo.projectId) {
      const project = getProjectById(todo.projectId);
      if (project) {
        const notified = new Set([req.user!.uid, todo.userId]);
        if (!notified.has(project.ownerUid)) {
          createNotification(
            project.ownerUid,
            "task_completed",
            "Tâche projet accomplie",
            `${req.user!.email} a terminé la tâche "${todo.title}" du projet "${project.name}"`,
            { todoId: todo.id, projectId: project.id }
          );
        }
      }
    }
  } catch (err) {
    console.warn("[todo.update] notification failed:", err);
  }

  try {
    logActivity(req.user!.uid, req.user!.email ?? "", "update", "todo", todo.id, { todoId: todo.id });
  } catch (err) {
    console.warn("[todo.update] activity log failed:", err);
  }
  res.status(200).json(todoToClientJson(todo));
}

export async function remove(req: AuthenticatedRequest, res: Response) {
  const id = req.params.id as string;
  const todo = deleteTodo(req.user!.uid, id);

  if (
    todo.scheduledSlot &&
    new Date(todo.scheduledSlot.start).getTime() > Date.now()
  ) {
    deleteGoogleCalendarEventForTodo(todo).catch((err) => {
      console.warn("[todo.remove] Google Calendar event cleanup failed:", err);
    });
    updateTodo(req.user!.uid, req.user!.email ?? "", id, { scheduledSlot: null });
    todo.scheduledSlot = null;
  }

  try {
    logActivity(req.user!.uid, req.user!.email ?? "", "delete", "todo", todo.id, { todoId: todo.id });
  } catch (err) {
    console.warn("[todo.remove] activity log failed:", err);
  }
  res.status(200).json(todoToClientJson(todo));
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

/**
 * Comment badges need counts for every task the user may see:
 * owned, assigned to them, and any task in a project they can open (incl. teammates' tasks).
 */
export async function commentCounts(req: AuthenticatedRequest, res: Response) {
  const uid = req.user!.uid;
  const email = req.user!.email ?? "";
  const idSet = new Set<string>();
  for (const t of listTodos(uid)) idSet.add(t.id);
  for (const t of listAssignedToMe(uid)) idSet.add(t.id);
  for (const p of listProjects(uid, email)) {
    for (const t of listProjectTodos(p.id)) idSet.add(t.id);
  }
  res.status(200).json(getCommentCounts([...idSet]));
}

export async function exportTodos(req: AuthenticatedRequest, res: Response) {
  const format = (req.query.format as string)?.toLowerCase() === "json" ? "json" : "csv";
  const includeArchived = req.query.include === "archived";
  const uid = req.user!.uid;
  const email = req.user!.email ?? "";

  const todos = includeArchived
    ? [...listTodos(uid), ...listArchivedTodos(uid, email)]
    : listTodos(uid);

  if (format === "json") {
    const data = todos.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      assignmentStatus: t.assignmentStatus,
      priority: t.priority,
      effort: t.effort,
      estimatedMinutes: t.estimatedMinutes,
      startDate: t.startDate,
      deadline: t.deadline,
      tags: t.tags,
      projectId: t.projectId,
      phaseId: t.phaseId,
      parentId: t.parentId,
      assignedTo: t.assignedTo,
      sortOrder: t.sortOrder,
      scheduledSlot: t.scheduledSlot
        ? {
            start: t.scheduledSlot.start,
            end: t.scheduledSlot.end,
            calendarEventId: t.scheduledSlot.calendarEventId,
          }
        : null,
      suggestedSlot: t.suggestedSlot,
      recurrence: t.recurrence,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      statusChangedAt: t.statusChangedAt,
    }));
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=wroket-tasks.json");
    res.send(JSON.stringify(data, null, 2));
    return;
  }

  const header =
    "id,title,status,assignmentStatus,priority,effort,estimatedMinutes,startDate,deadline,tags,projectId,phaseId,parentId,assignedTo,sortOrder," +
    "scheduledStart,scheduledEnd,calendarEventId,suggestedStart,suggestedEnd,recurrenceJson,createdAt,updatedAt,statusChangedAt\n";
  const rows = todos
    .map((t) => {
      const slot = t.scheduledSlot;
      const sug = t.suggestedSlot;
      const recStr = t.recurrence ? csvSafe(JSON.stringify(t.recurrence)) : "";
      const fields = [
        t.id,
        csvSafe(t.title ?? ""),
        t.status,
        t.assignmentStatus ?? "",
        t.priority ?? "",
        t.effort ?? "",
        t.estimatedMinutes != null ? String(t.estimatedMinutes) : "",
        t.startDate ?? "",
        t.deadline ?? "",
        csvSafe((t.tags ?? []).join(", ")),
        t.projectId ?? "",
        t.phaseId ?? "",
        t.parentId ?? "",
        t.assignedTo ?? "",
        t.sortOrder != null ? String(t.sortOrder) : "",
        slot?.start ?? "",
        slot?.end ?? "",
        slot?.calendarEventId ?? "",
        sug?.start ?? "",
        sug?.end ?? "",
        recStr,
        t.createdAt ?? "",
        t.updatedAt ?? "",
        t.statusChangedAt ?? "",
      ];
      return fields.join(",");
    })
    .join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=wroket-tasks.csv");
  res.send(header + rows);
}

export async function importTodos(req: AuthenticatedRequest, res: Response) {
  const uid = req.user!.uid;
  const email = req.user!.email ?? "";

  let rows: Record<string, unknown>[];

  if (req.file) {
    rows = parseTaskImportBuffer(req.file.buffer, req.file.originalname, req.file.mimetype);
  } else if (req.body?.tasks && Array.isArray(req.body.tasks)) {
    rows = req.body.tasks as Record<string, unknown>[];
  } else {
    throw new ValidationError("Fichier ou tableau de tâches requis");
  }

  if (rows.length === 0) throw new ValidationError("Aucune tâche à importer");
  if (rows.length > 1000) throw new ValidationError("Maximum 1000 tâches par import");

  let created = 0;
  const errors: Array<{ row: number; message: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    try {
      const input = coerceImportRowToCreateInput(rows[i]);
      createTodo(uid, email, input);
      created++;
    } catch (err) {
      errors.push({ row: i + 1, message: err instanceof Error ? err.message : "Erreur" });
    }
  }

  res.status(201).json({ created, errors, total: rows.length });
}

/** POST multipart: parse file and return coercible rows + per-row preview errors (no DB writes). */
export async function previewTaskImport(req: AuthenticatedRequest, res: Response) {
  if (!req.file) throw new ValidationError("Fichier requis");
  const rows = parseTaskImportBuffer(req.file.buffer, req.file.originalname, req.file.mimetype);
  if (rows.length === 0) throw new ValidationError("Aucune ligne");
  if (rows.length > 1000) throw new ValidationError("Maximum 1000 tâches par import");
  const { total, errors, validInputs } = previewTaskImportRows(rows);
  res.status(200).json({ total, errors, validTasks: validInputs });
}

/** POST JSON { tasks: CreateTodoInput[] } — same shape as validTasks from preview. */
export async function confirmTaskImport(req: AuthenticatedRequest, res: Response) {
  const uid = req.user!.uid;
  const email = req.user!.email ?? "";
  const body = req.body as { tasks?: unknown };
  if (!body?.tasks || !Array.isArray(body.tasks)) {
    throw new ValidationError("Corps JSON { tasks: [...] } requis");
  }
  const raw = body.tasks as Record<string, unknown>[];
  const inputs: CreateTodoInput[] = [];
  for (const row of raw) {
    inputs.push(coerceImportRowToCreateInput(row));
  }
  const result = executeTaskImport(uid, email, inputs);
  res.status(201).json(result);
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
