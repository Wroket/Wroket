import type { AuthUser } from "../authService";
import { deleteExternalBookingForTodo } from "../calendarBookingCleanup";
import { createNote } from "../noteService";
import {
  createTemplate,
  deleteTemplate,
  listTemplates,
} from "../templateService";
import {
  createTodo,
  deleteTodo,
  findTodoForUser,
  listAssignedToMe,
  listTodos,
  moveTodo,
  permanentlyRemoveArchivedTodo,
  updateTodo,
  type MoveTodoStrategy,
  type PreferredBookingTarget,
  type Recurrence,
  type Todo,
  type TodoStatus,
} from "../todoService";
import { ValidationError, NotFoundError } from "../../utils/errors";
import type { McpToolDef, McpToolHandler } from "./types";
import { clampLimit, optionalString, requireString } from "./types";
import {
  bookingTargetSchemaProperties,
  resolveBookingTargetFromArgs,
} from "./bookingTargetArgs";

function leanTodo(t: Todo): Record<string, unknown> {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    effort: t.effort,
    estimatedMinutes: t.estimatedMinutes ?? null,
    deadline: t.deadline,
    startDate: t.startDate,
    tags: t.tags,
    projectId: t.projectId,
    phaseId: t.phaseId,
    parentId: t.parentId,
    scheduledSlot: t.scheduledSlot,
    preferredBookingTarget: t.preferredBookingTarget ?? null,
    recurrence: t.recurrence ?? null,
    assignedTo: t.assignedTo ?? null,
    assignmentStatus: t.assignmentStatus ?? null,
    blockedByTodoIds: t.blockedByTodoIds ?? [],
    customFieldValues: t.customFieldValues ?? {},
    updatedAt: t.updatedAt,
    createdAt: t.createdAt,
  };
}

function preferredTargetFromArgs(
  uid: string,
  args: Record<string, unknown>,
): PreferredBookingTarget | null | undefined {
  const hasHint =
    optionalString(args, "calendarId") ||
    optionalString(args, "calendarTag") ||
    optionalString(args, "tag") ||
    optionalString(args, "calendarLabel") ||
    optionalString(args, "customLabel") ||
    optionalString(args, "calendarName") ||
    optionalString(args, "provider") ||
    optionalString(args, "accountId");
  if (!hasHint) return undefined;
  const resolved = resolveBookingTargetFromArgs(uid, args);
  if (!resolved) return null;
  return {
    provider: resolved.provider,
    accountId: resolved.accountId,
    calendarId: resolved.calendarId,
  };
}

function parseRecurrence(raw: unknown): Recurrence | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new ValidationError("recurrence doit être un objet { frequency, interval?, endDate? } ou null");
  }
  const r = raw as Record<string, unknown>;
  const freq = r.frequency;
  if (freq !== "daily" && freq !== "weekly" && freq !== "monthly") {
    throw new ValidationError("recurrence.frequency doit être 'daily', 'weekly' ou 'monthly'");
  }
  const interval = typeof r.interval === "number" && r.interval >= 1 ? Math.round(r.interval) : 1;
  const endDate = typeof r.endDate === "string" && r.endDate.trim() ? r.endDate.trim() : undefined;
  return {
    frequency: freq,
    interval,
    ...(endDate ? { endDate } : {}),
  };
}

function parseCustomFieldValues(
  raw: unknown,
): Record<string, string | number | boolean | null> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (
      v === null ||
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean"
    ) {
      out[k] = v;
    }
  }
  return out;
}

/** Map agent-friendly aliases to canonical TodoStatus. */
export function normalizeTodoStatus(raw: unknown): TodoStatus | undefined {
  if (raw === "open" || raw === "active") return "active";
  if (raw === "done" || raw === "completed") return "completed";
  if (raw === "cancelled" || raw === "archived") return "cancelled";
  return undefined;
}

function parseTags(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.filter((t): t is string => typeof t === "string").map((t) => t.trim()).filter(Boolean);
}

const STATUS_ENUM = ["active", "completed", "cancelled", "open", "done"];

export const todoToolDefs: McpToolDef[] = [
  {
    name: "list_todos",
    description:
      "List the authenticated user's tasks (including tasks assigned to the user unless includeAssigned is false). Optional status and projectId filters.",
    requiredScope: "todos:read",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Filter: active, completed, cancelled (aliases: open→active, done→completed)",
          enum: STATUS_ENUM,
        },
        projectId: { type: "string", description: "Filter by project id" },
        includeAssigned: {
          type: "boolean",
          description: "Include tasks delegated/assigned to the user (default true)",
        },
        limit: { type: "number", description: "Max items (default 50, max 200)" },
      },
    },
  },
  {
    name: "get_todo",
    description: "Get a single task by id.",
    requiredScope: "todos:read",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Task id" } },
      required: ["id"],
    },
  },
  {
    name: "create_todo",
    description:
      "Create a task (title required). Supports projectId, phaseId, parentId, tags, estimatedMinutes (15..480), recurrence, preferred booking calendar (calendarId/calendarTag/calendarLabel), and optional notes (creates a linked task note).",
    requiredScope: "todos:write",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        priority: { type: "string", enum: ["low", "medium", "high"] },
        effort: { type: "string", enum: ["light", "medium", "heavy"] },
        estimatedMinutes: { type: ["number", "null"], description: "Estimated duration in minutes (15..480)" },
        deadline: { type: "string", description: "ISO date YYYY-MM-DD" },
        startDate: { type: "string", description: "ISO date YYYY-MM-DD" },
        projectId: { type: "string" },
        phaseId: { type: "string" },
        parentId: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        status: { type: "string", enum: STATUS_ENUM },
        recurrence: {
          type: ["object", "null"],
          description: "Recurrence rule { frequency: 'daily'|'weekly'|'monthly', interval?: number, endDate?: string }",
          properties: {
            frequency: { type: "string", enum: ["daily", "weekly", "monthly"] },
            interval: { type: "number" },
            endDate: { type: "string" },
          },
        },
        notes: {
          type: "string",
          description: "Optional markdown description/notes to attach to the task",
        },
        ...bookingTargetSchemaProperties,
      },
      required: ["title"],
    },
  },
  {
    name: "create_todos_batch",
    description:
      "Batch-create up to 25 tasks (and optional subtasks) in one call. Ideal for breaking down a project or action plan.",
    requiredScope: "todos:write",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Default projectId for all items unless overridden" },
        phaseId: { type: "string", description: "Default phaseId for all items unless overridden" },
        tasks: {
          type: "array",
          description: "List of tasks to create (max 25)",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              priority: { type: "string", enum: ["low", "medium", "high"] },
              effort: { type: "string", enum: ["light", "medium", "heavy"] },
              estimatedMinutes: { type: "number" },
              deadline: { type: "string" },
              startDate: { type: "string" },
              projectId: { type: "string" },
              phaseId: { type: "string" },
              tags: { type: "array", items: { type: "string" } },
              subtasks: {
                type: "array",
                items: { type: "string" },
                description: "Optional subtask titles to create under this task",
              },
            },
            required: ["title"],
          },
        },
      },
      required: ["tasks"],
    },
  },
  {
    name: "update_todo",
    description:
      "Update title, priority, effort, estimatedMinutes, dates, status, projectId, phaseId, parentId, tags, recurrence, preferred booking calendar, or customFieldValues.",
    requiredScope: "todos:write",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        priority: { type: "string", enum: ["low", "medium", "high"] },
        effort: { type: "string", enum: ["light", "medium", "heavy"] },
        estimatedMinutes: { type: ["number", "null"] },
        deadline: { type: ["string", "null"] },
        startDate: { type: ["string", "null"] },
        projectId: { type: ["string", "null"] },
        phaseId: { type: ["string", "null"] },
        parentId: { type: ["string", "null"] },
        tags: { type: "array", items: { type: "string" } },
        status: { type: "string", enum: STATUS_ENUM },
        recurrence: {
          type: ["object", "null"],
          properties: {
            frequency: { type: "string", enum: ["daily", "weekly", "monthly"] },
            interval: { type: "number" },
            endDate: { type: "string" },
          },
        },
        customFieldValues: {
          type: "object",
          description: "Key-value map of customFieldDefId -> string | number | boolean | null",
        },
        ...bookingTargetSchemaProperties,
      },
      required: ["id"],
    },
  },
  {
    name: "delete_todo",
    description:
      "Delete (archive to trash) or permanently remove a task, cleaning up any future external calendar booking.",
    requiredScope: "todos:write",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Task id" },
        permanent: {
          type: "boolean",
          description: "If true, permanently purges an archived/deleted task",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "move_todo",
    description:
      "Move a task to another phase (project DnD). Use strategy when dates/slot conflict with the phase window.",
    requiredScope: "todos:write",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Task id" },
        phaseId: { type: ["string", "null"], description: "Target phase id (null to clear)" },
        startDate: { type: ["string", "null"] },
        deadline: { type: ["string", "null"] },
        sortOrder: { type: "number" },
        strategy: {
          type: "string",
          enum: ["default", "clampDatesToPhase", "clearScheduledSlot", "keepDates", "rescheduleSlot"],
        },
        forceCalendarConflict: { type: "boolean" },
      },
      required: ["id"],
    },
  },
  {
    name: "list_task_templates",
    description: "List the user's reusable task templates.",
    requiredScope: "todos:read",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "create_task_template",
    description:
      "Create a reusable task template (name, emoji, description, priority, effort, estimatedMinutes, tags, subtasks).",
    requiredScope: "todos:write",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        emoji: { type: "string" },
        description: { type: "string" },
        priority: { type: "string", enum: ["low", "medium", "high"] },
        effort: { type: "string", enum: ["light", "medium", "heavy"] },
        estimatedMinutes: { type: ["number", "null"] },
        tags: { type: "array", items: { type: "string" } },
        subtasks: { type: "array", items: { type: "string" } },
      },
      required: ["name"],
    },
  },
  {
    name: "delete_task_template",
    description: "Delete a reusable task template by id.",
    requiredScope: "todos:write",
    inputSchema: {
      type: "object",
      properties: {
        templateId: { type: "string" },
      },
      required: ["templateId"],
    },
  },
  {
    name: "create_todo_from_template",
    description:
      "Instantiate a task (and all its subtasks + description note) from a saved task template id.",
    requiredScope: "todos:write",
    inputSchema: {
      type: "object",
      properties: {
        templateId: { type: "string", description: "Task template id" },
        title: { type: "string", description: "Optional title override (defaults to template name)" },
        projectId: { type: "string" },
        phaseId: { type: "string" },
        deadline: { type: "string", description: "Optional YYYY-MM-DD deadline" },
        startDate: { type: "string", description: "Optional YYYY-MM-DD start date" },
      },
      required: ["templateId"],
    },
  },
];

async function listTodosHandler(user: AuthUser, args: Record<string, unknown>) {
  const includeAssigned = args.includeAssigned !== false;
  const [owned, assigned] = await Promise.all([
    listTodos(user.uid),
    includeAssigned ? listAssignedToMe(user.uid) : Promise.resolve([]),
  ]);
  const seen = new Set<string>();
  let filtered = [...owned, ...assigned].filter((t) => {
    if (seen.has(t.id) || t.status === "deleted") return false;
    seen.add(t.id);
    return true;
  });
  const status = normalizeTodoStatus(args.status);
  if (status) filtered = filtered.filter((t) => t.status === status);
  const projectId = optionalString(args, "projectId");
  if (projectId) filtered = filtered.filter((t) => t.projectId === projectId);
  const limit = clampLimit(args.limit);
  return { todos: filtered.slice(0, limit).map(leanTodo), total: filtered.length };
}

async function getTodoHandler(user: AuthUser, args: Record<string, unknown>) {
  const id = requireString(args, "id");
  const found = await findTodoForUser(user.uid, id);
  if (!found || found.todo.status === "deleted") throw new NotFoundError("Tâche introuvable");
  return leanTodo(found.todo);
}

async function createTodoHandler(user: AuthUser, args: Record<string, unknown>) {
  const title = requireString(args, "title");
  const priority =
    args.priority === "low" || args.priority === "medium" || args.priority === "high"
      ? args.priority
      : "medium";
  const effort =
    args.effort === "light" || args.effort === "medium" || args.effort === "heavy"
      ? args.effort
      : undefined;
  const estimatedMinutes =
    args.estimatedMinutes === null
      ? null
      : typeof args.estimatedMinutes === "number" && Number.isFinite(args.estimatedMinutes)
        ? Math.round(args.estimatedMinutes)
        : undefined;
  const recurrence = parseRecurrence(args.recurrence);

  const preferredBookingTarget = preferredTargetFromArgs(user.uid, args);
  const created = await createTodo(user.uid, user.email, {
    title,
    priority,
    effort,
    ...(estimatedMinutes !== undefined ? { estimatedMinutes } : {}),
    ...(recurrence !== undefined ? { recurrence } : {}),
    ...(preferredBookingTarget !== undefined ? { preferredBookingTarget } : {}),
    deadline: optionalString(args, "deadline") ?? null,
    startDate: optionalString(args, "startDate") ?? null,
    projectId: optionalString(args, "projectId") ?? null,
    phaseId: optionalString(args, "phaseId") ?? null,
    parentId: optionalString(args, "parentId") ?? null,
    tags: parseTags(args.tags),
    status: normalizeTodoStatus(args.status),
    allowPastDeadline: true,
  });

  const notesContent = optionalString(args, "notes");
  let linkedNoteId: string | null = null;
  if (notesContent) {
    const note = createNote(user.uid, {
      title: created.title,
      content: notesContent,
      todoId: created.id,
      projectId: created.projectId ?? undefined,
    });
    linkedNoteId = note.id;
  }

  return {
    ...leanTodo(created),
    ...(linkedNoteId ? { linkedNoteId } : {}),
  };
}

async function createTodosBatchHandler(user: AuthUser, args: Record<string, unknown>) {
  if (!Array.isArray(args.tasks) || args.tasks.length === 0) {
    throw new ValidationError("tasks doit être un tableau non vide");
  }
  if (args.tasks.length > 25) {
    throw new ValidationError("Maximum 25 tâches par appel create_todos_batch");
  }
  const defaultProjectId = optionalString(args, "projectId") ?? null;
  const defaultPhaseId = optionalString(args, "phaseId") ?? null;

  const createdTasks: Array<Record<string, unknown>> = [];
  for (const raw of args.tasks) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const title = typeof item.title === "string" ? item.title.trim() : "";
    if (!title) continue;
    const priority =
      item.priority === "low" || item.priority === "medium" || item.priority === "high"
        ? item.priority
        : "medium";
    const effort =
      item.effort === "light" || item.effort === "medium" || item.effort === "heavy"
        ? item.effort
        : undefined;
    const estimatedMinutes =
      typeof item.estimatedMinutes === "number" && Number.isFinite(item.estimatedMinutes)
        ? Math.round(item.estimatedMinutes)
        : undefined;
    const projectId = optionalString(item, "projectId") ?? defaultProjectId;
    const phaseId = optionalString(item, "phaseId") ?? defaultPhaseId;

    const parent = await createTodo(user.uid, user.email, {
      title,
      priority,
      effort,
      ...(estimatedMinutes !== undefined ? { estimatedMinutes } : {}),
      deadline: optionalString(item, "deadline") ?? null,
      startDate: optionalString(item, "startDate") ?? null,
      projectId,
      phaseId,
      tags: parseTags(item.tags),
      allowPastDeadline: true,
    });

    const createdSubtasks: Array<Record<string, unknown>> = [];
    if (Array.isArray(item.subtasks)) {
      for (const subRaw of item.subtasks.slice(0, 20)) {
        const subTitle = typeof subRaw === "string" ? subRaw.trim() : "";
        if (!subTitle) continue;
        const sub = await createTodo(user.uid, user.email, {
          title: subTitle,
          priority,
          projectId,
          phaseId,
          parentId: parent.id,
          allowPastDeadline: true,
        });
        createdSubtasks.push(leanTodo(sub));
      }
    }

    createdTasks.push({
      ...leanTodo(parent),
      ...(createdSubtasks.length > 0 ? { subtasks: createdSubtasks } : {}),
    });
  }

  return {
    createdCount: createdTasks.length,
    tasks: createdTasks,
  };
}

async function updateTodoHandler(user: AuthUser, args: Record<string, unknown>) {
  const id = requireString(args, "id");
  const patch: Parameters<typeof updateTodo>[3] = {};
  if (typeof args.title === "string") patch.title = args.title;
  if (args.priority === "low" || args.priority === "medium" || args.priority === "high") {
    patch.priority = args.priority;
  }
  if (args.effort === "light" || args.effort === "medium" || args.effort === "heavy") {
    patch.effort = args.effort;
  }
  if (args.estimatedMinutes === null) patch.estimatedMinutes = null;
  else if (typeof args.estimatedMinutes === "number" && Number.isFinite(args.estimatedMinutes)) {
    patch.estimatedMinutes = Math.round(args.estimatedMinutes);
  }
  if (args.deadline === null) patch.deadline = null;
  else if (typeof args.deadline === "string") patch.deadline = args.deadline;
  if (args.startDate === null) patch.startDate = null;
  else if (typeof args.startDate === "string") patch.startDate = args.startDate;
  if (args.projectId === null) patch.projectId = null;
  else if (typeof args.projectId === "string") patch.projectId = args.projectId;
  if (args.phaseId === null) patch.phaseId = null;
  else if (typeof args.phaseId === "string") patch.phaseId = args.phaseId;
  if (args.parentId === null) patch.parentId = null;
  else if (typeof args.parentId === "string") patch.parentId = args.parentId;
  const tags = parseTags(args.tags);
  if (tags) patch.tags = tags;
  const status = normalizeTodoStatus(args.status);
  if (status) patch.status = status;
  const recurrence = parseRecurrence(args.recurrence);
  if (recurrence !== undefined) patch.recurrence = recurrence;
  const customFieldValues = parseCustomFieldValues(args.customFieldValues);
  if (customFieldValues) patch.customFieldValues = customFieldValues;
  const preferredBookingTarget = preferredTargetFromArgs(user.uid, args);
  if (preferredBookingTarget !== undefined) patch.preferredBookingTarget = preferredBookingTarget;
  return leanTodo(await updateTodo(user.uid, user.email, id, patch));
}

async function deleteTodoHandler(user: AuthUser, args: Record<string, unknown>) {
  const id = requireString(args, "id");
  const permanent = args.permanent === true;

  if (permanent) {
    const snapshots = await permanentlyRemoveArchivedTodo(user.uid, id);
    for (const s of snapshots) {
      if (s.scheduledSlot && new Date(s.scheduledSlot.start).getTime() > Date.now()) {
        deleteExternalBookingForTodo(s).catch(() => null);
      }
    }
    return { deleted: true, permanent: true, id, purgedCount: snapshots.length };
  }

  let todo = await deleteTodo(user.uid, id);
  if (todo.scheduledSlot && new Date(todo.scheduledSlot.start).getTime() > Date.now()) {
    deleteExternalBookingForTodo(todo).catch(() => null);
    todo = await updateTodo(user.uid, user.email, id, { scheduledSlot: null });
  }
  return { deleted: true, permanent: false, todo: leanTodo(todo) };
}

async function moveTodoHandler(user: AuthUser, args: Record<string, unknown>) {
  const id = requireString(args, "id");
  const strategies: MoveTodoStrategy[] = [
    "default",
    "clampDatesToPhase",
    "clearScheduledSlot",
    "keepDates",
    "rescheduleSlot",
  ];
  const strategy =
    typeof args.strategy === "string" && strategies.includes(args.strategy as MoveTodoStrategy)
      ? (args.strategy as MoveTodoStrategy)
      : undefined;

  let phaseId: string | null | undefined;
  if (args.phaseId === null) phaseId = null;
  else if (typeof args.phaseId === "string") phaseId = args.phaseId.trim() || null;
  else if (args.phaseId !== undefined) {
    throw new ValidationError("phaseId doit être une chaîne ou null");
  }

  const moved = await moveTodo(user.uid, user.email, id, {
    phaseId,
    startDate:
      args.startDate === null ? null : typeof args.startDate === "string" ? args.startDate : undefined,
    deadline:
      args.deadline === null ? null : typeof args.deadline === "string" ? args.deadline : undefined,
    sortOrder: typeof args.sortOrder === "number" ? args.sortOrder : undefined,
    strategy,
    forceCalendarConflict: args.forceCalendarConflict === true,
  });
  return leanTodo(moved);
}

function listTaskTemplatesHandler(user: AuthUser, _args: Record<string, unknown>) {
  return { templates: listTemplates(user.uid) };
}

function createTaskTemplateHandler(user: AuthUser, args: Record<string, unknown>) {
  const name = requireString(args, "name");
  const priority =
    args.priority === "low" || args.priority === "medium" || args.priority === "high"
      ? args.priority
      : undefined;
  const effort =
    args.effort === "light" || args.effort === "medium" || args.effort === "heavy"
      ? args.effort
      : undefined;
  const estimatedMinutes =
    args.estimatedMinutes === null
      ? null
      : typeof args.estimatedMinutes === "number" && Number.isFinite(args.estimatedMinutes)
        ? Math.round(args.estimatedMinutes)
        : undefined;
  const subtasks = Array.isArray(args.subtasks)
    ? args.subtasks.filter((s): s is string => typeof s === "string")
    : undefined;
  const tpl = createTemplate(user.uid, {
    name,
    emoji: optionalString(args, "emoji"),
    description: optionalString(args, "description"),
    priority,
    effort,
    estimatedMinutes,
    tags: parseTags(args.tags),
    subtasks,
  });
  return tpl;
}

function deleteTaskTemplateHandler(user: AuthUser, args: Record<string, unknown>) {
  const templateId = requireString(args, "templateId");
  deleteTemplate(user.uid, templateId);
  return { deleted: true, templateId };
}

async function createTodoFromTemplateHandler(user: AuthUser, args: Record<string, unknown>) {
  const templateId = requireString(args, "templateId");
  const tpl = listTemplates(user.uid).find((t) => t.id === templateId);
  if (!tpl) throw new NotFoundError("Template de tâche introuvable");

  const title = optionalString(args, "title") ?? tpl.name;
  const projectId = optionalString(args, "projectId") ?? null;
  const phaseId = optionalString(args, "phaseId") ?? null;

  const parent = await createTodo(user.uid, user.email, {
    title,
    priority: tpl.priority,
    effort: tpl.effort,
    estimatedMinutes: tpl.estimatedMinutes,
    tags: tpl.tags,
    projectId,
    phaseId,
    deadline: optionalString(args, "deadline") ?? null,
    startDate: optionalString(args, "startDate") ?? null,
    allowPastDeadline: true,
  });

  if (tpl.description?.trim()) {
    createNote(user.uid, {
      title: parent.title,
      content: tpl.description.trim(),
      todoId: parent.id,
      projectId: projectId ?? undefined,
    });
  }

  const createdSubtasks: Array<Record<string, unknown>> = [];
  for (const subTitle of tpl.subtasks ?? []) {
    if (!subTitle.trim()) continue;
    const sub = await createTodo(user.uid, user.email, {
      title: subTitle.trim(),
      priority: tpl.priority,
      projectId,
      phaseId,
      parentId: parent.id,
      allowPastDeadline: true,
    });
    createdSubtasks.push(leanTodo(sub));
  }

  return {
    ...leanTodo(parent),
    subtasks: createdSubtasks,
  };
}

export const todoHandlers: Record<string, McpToolHandler> = {
  list_todos: listTodosHandler,
  get_todo: getTodoHandler,
  create_todo: createTodoHandler,
  create_todos_batch: createTodosBatchHandler,
  update_todo: updateTodoHandler,
  delete_todo: deleteTodoHandler,
  move_todo: moveTodoHandler,
  list_task_templates: listTaskTemplatesHandler,
  create_task_template: createTaskTemplateHandler,
  delete_task_template: deleteTaskTemplateHandler,
  create_todo_from_template: createTodoFromTemplateHandler,
};
