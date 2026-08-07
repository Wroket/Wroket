import type { AuthUser } from "../authService";
import {
  createTodo,
  findTodoForUser,
  listTodos,
  moveTodo,
  updateTodo,
  type MoveTodoStrategy,
  type Todo,
  type TodoStatus,
} from "../todoService";
import { ValidationError, NotFoundError } from "../../utils/errors";
import type { McpToolDef, McpToolHandler } from "./types";
import { clampLimit, optionalString, requireString } from "./types";

function leanTodo(t: Todo): Record<string, unknown> {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    effort: t.effort,
    deadline: t.deadline,
    startDate: t.startDate,
    tags: t.tags,
    projectId: t.projectId,
    phaseId: t.phaseId,
    parentId: t.parentId,
    scheduledSlot: t.scheduledSlot,
    updatedAt: t.updatedAt,
    createdAt: t.createdAt,
  };
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
    description: "List the authenticated user's tasks. Optional status filter.",
    requiredScope: "todos:read",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Filter: active, completed, cancelled (aliases: open→active, done→completed)",
          enum: STATUS_ENUM,
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
    description: "Create a task (title required). Supports projectId, phaseId, parentId, tags.",
    requiredScope: "todos:write",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        priority: { type: "string", enum: ["low", "medium", "high"] },
        effort: { type: "string", enum: ["light", "medium", "heavy"] },
        deadline: { type: "string", description: "ISO date YYYY-MM-DD" },
        startDate: { type: "string", description: "ISO date YYYY-MM-DD" },
        projectId: { type: "string" },
        phaseId: { type: "string" },
        parentId: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        status: { type: "string", enum: STATUS_ENUM },
      },
      required: ["title"],
    },
  },
  {
    name: "update_todo",
    description: "Update title, priority, effort, dates, status, projectId, phaseId, parentId, or tags.",
    requiredScope: "todos:write",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        priority: { type: "string", enum: ["low", "medium", "high"] },
        effort: { type: "string", enum: ["light", "medium", "heavy"] },
        deadline: { type: ["string", "null"] },
        startDate: { type: ["string", "null"] },
        projectId: { type: ["string", "null"] },
        phaseId: { type: ["string", "null"] },
        parentId: { type: ["string", "null"] },
        tags: { type: "array", items: { type: "string" } },
        status: { type: "string", enum: STATUS_ENUM },
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
];

async function listTodosHandler(user: AuthUser, args: Record<string, unknown>) {
  const todos = await listTodos(user.uid);
  let filtered = todos.filter((t) => t.status !== "deleted");
  const status = normalizeTodoStatus(args.status);
  if (status) filtered = filtered.filter((t) => t.status === status);
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
  const created = await createTodo(user.uid, user.email, {
    title,
    priority,
    effort,
    deadline: optionalString(args, "deadline") ?? null,
    startDate: optionalString(args, "startDate") ?? null,
    projectId: optionalString(args, "projectId") ?? null,
    phaseId: optionalString(args, "phaseId") ?? null,
    parentId: optionalString(args, "parentId") ?? null,
    tags: parseTags(args.tags),
    status: normalizeTodoStatus(args.status),
    allowPastDeadline: true,
  });
  return leanTodo(created);
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
  return leanTodo(await updateTodo(user.uid, user.email, id, patch));
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

export const todoHandlers: Record<string, McpToolHandler> = {
  list_todos: listTodosHandler,
  get_todo: getTodoHandler,
  create_todo: createTodoHandler,
  update_todo: updateTodoHandler,
  move_todo: moveTodoHandler,
};
