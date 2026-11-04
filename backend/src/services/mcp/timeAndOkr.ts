import type { AuthUser } from "../authService";
import {
  computeOkrProgress,
  createOkr,
  deleteOkr,
  getOkrForOwner,
  listOkrsForOwner,
  refreshOkrFromTodos,
  updateOkr,
} from "../okrService";
import {
  addManualTimeSession,
  getActiveTimerForUser,
  startTimeTimer,
  stopTimeTimer,
  sumMinutesForTodo,
} from "../timeSessionService";
import { ValidationError } from "../../utils/errors";
import type { McpToolDef, McpToolHandler } from "./types";
import { optionalString, requireString } from "./types";

export const timeAndOkrToolDefs: McpToolDef[] = [
  {
    name: "get_active_timer",
    description: "Get the currently running time-tracking timer for the user, if any.",
    requiredScope: "todos:read",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "start_timer",
    description: "Start a live time-tracking timer on a task (Small teams+).",
    requiredScope: "todos:write",
    inputSchema: {
      type: "object",
      properties: {
        todoId: { type: "string", description: "Task id" },
      },
      required: ["todoId"],
    },
  },
  {
    name: "stop_timer",
    description: "Stop the currently running time-tracking timer and record elapsed minutes.",
    requiredScope: "todos:write",
    inputSchema: {
      type: "object",
      properties: {
        todoId: { type: "string", description: "Optional task id to verify against the active timer" },
      },
    },
  },
  {
    name: "log_time",
    description: "Log manual time spent on a task in minutes (1 to 1440).",
    requiredScope: "todos:write",
    inputSchema: {
      type: "object",
      properties: {
        todoId: { type: "string", description: "Task id" },
        durationMinutes: { type: "number", description: "Minutes spent (1..1440)" },
        note: { type: "string", description: "Optional work log note" },
        startedAt: { type: "string", description: "Optional ISO start timestamp" },
      },
      required: ["todoId", "durationMinutes"],
    },
  },
  {
    name: "list_okrs",
    description: "List the user's OKR objectives and key results with progress percentage.",
    requiredScope: "projects:read",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "create_okr",
    description:
      "Create a new OKR objective with its Key Results (Small teams+).",
    requiredScope: "projects:write",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Objective title" },
        description: { type: "string", description: "Optional objective description" },
        teamId: { type: ["string", "null"], description: "Optional teamId" },
        keyResults: {
          type: "array",
          description: "Initial Key Results for this Objective",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              target: { type: "number", description: "Target numeric value (default 100)" },
              current: { type: "number", description: "Starting numeric value (default 0)" },
              unit: { type: "string", description: "Unit label, e.g. '%', 'clients', '€'" },
              linkedTodoIds: { type: "array", items: { type: "string" } },
              linkedProjectIds: { type: "array", items: { type: "string" } },
            },
            required: ["title"],
          },
        },
      },
      required: ["title"],
    },
  },
  {
    name: "update_key_result",
    description:
      "Update a Key Result's current value within an OKR objective, or refresh OKR progress from linked tasks.",
    requiredScope: "projects:write",
    inputSchema: {
      type: "object",
      properties: {
        okrId: { type: "string", description: "OKR objective id" },
        keyResultId: { type: "string", description: "Key Result id (optional if refreshFromTodos is true)" },
        current: { type: "number", description: "New current value for the Key Result" },
        refreshFromTodos: {
          type: "boolean",
          description: "If true, recalculates linked Key Results from completed todos",
        },
      },
      required: ["okrId"],
    },
  },
  {
    name: "delete_okr",
    description: "Delete an OKR objective by id.",
    requiredScope: "projects:write",
    inputSchema: {
      type: "object",
      properties: {
        okrId: { type: "string", description: "OKR objective id" },
      },
      required: ["okrId"],
    },
  },
];

function getActiveTimerHandler(user: AuthUser, _args: Record<string, unknown>) {
  const active = getActiveTimerForUser(user.uid);
  if (!active) return { active: false, session: null };
  const elapsedMinutes = Math.max(
    1,
    Math.round((Date.now() - new Date(active.startedAt).getTime()) / 60_000),
  );
  return {
    active: true,
    elapsedMinutes,
    session: active,
  };
}

async function startTimerHandler(user: AuthUser, args: Record<string, unknown>) {
  const todoId = requireString(args, "todoId");
  const session = await startTimeTimer(user.uid, user.email, todoId);
  return { started: true, session };
}

function stopTimerHandler(user: AuthUser, args: Record<string, unknown>) {
  const todoId = optionalString(args, "todoId");
  const session = stopTimeTimer(user.uid, todoId);
  const totalTodoMinutes = sumMinutesForTodo(session.todoId);
  return { stopped: true, session, totalTodoMinutes };
}

async function logTimeHandler(user: AuthUser, args: Record<string, unknown>) {
  const todoId = requireString(args, "todoId");
  const durationMinutes = Number(args.durationMinutes);
  if (!Number.isFinite(durationMinutes)) {
    throw new ValidationError("durationMinutes est requis et doit être un nombre");
  }
  const note = optionalString(args, "note") ?? null;
  const startedAt = optionalString(args, "startedAt");
  const session = await addManualTimeSession(user.uid, todoId, durationMinutes, note, startedAt);
  const totalTodoMinutes = sumMinutesForTodo(todoId);
  return { logged: true, session, totalTodoMinutes };
}

function listOkrsHandler(user: AuthUser, _args: Record<string, unknown>) {
  const okrs = listOkrsForOwner(user.uid).map((o) => ({
    ...o,
    progressPercent: computeOkrProgress(o),
  }));
  return { okrs };
}

function createOkrHandler(user: AuthUser, args: Record<string, unknown>) {
  const title = requireString(args, "title");
  const description = optionalString(args, "description");
  const teamId = args.teamId === null ? null : optionalString(args, "teamId") ?? null;
  const rawKrs = Array.isArray(args.keyResults) ? args.keyResults : [];
  const keyResults = rawKrs
    .filter((k): k is Record<string, unknown> => Boolean(k && typeof k === "object"))
    .map((kr) => ({
      title: String(kr.title ?? "").trim(),
      target: typeof kr.target === "number" && Number.isFinite(kr.target) ? kr.target : 100,
      current: typeof kr.current === "number" && Number.isFinite(kr.current) ? kr.current : 0,
      unit: typeof kr.unit === "string" ? kr.unit : "%",
      linkedTodoIds: Array.isArray(kr.linkedTodoIds)
        ? kr.linkedTodoIds.filter((id): id is string => typeof id === "string")
        : [],
      linkedProjectIds: Array.isArray(kr.linkedProjectIds)
        ? kr.linkedProjectIds.filter((id): id is string => typeof id === "string")
        : [],
    }))
    .filter((kr) => kr.title.length > 0);

  const created = createOkr(user.uid, {
    title,
    description,
    teamId,
    keyResults,
  });
  return {
    ...created,
    progressPercent: computeOkrProgress(created),
  };
}

function deleteOkrHandler(user: AuthUser, args: Record<string, unknown>) {
  const okrId = requireString(args, "okrId");
  deleteOkr(user.uid, okrId);
  return { deleted: true, okrId };
}

async function updateKeyResultHandler(user: AuthUser, args: Record<string, unknown>) {
  const okrId = requireString(args, "okrId");
  if (args.refreshFromTodos === true) {
    const refreshed = await refreshOkrFromTodos(user.uid, user.email, okrId);
    return {
      ...refreshed,
      progressPercent: computeOkrProgress(refreshed),
    };
  }
  const keyResultId = requireString(args, "keyResultId");
  const current = Number(args.current);
  if (!Number.isFinite(current)) {
    throw new ValidationError("current doit être un nombre fini");
  }
  const existing = getOkrForOwner(user.uid, okrId);
  const foundKr = existing.keyResults.some((kr) => kr.id === keyResultId);
  if (!foundKr) {
    throw new ValidationError("Key Result introuvable dans cet OKR");
  }
  const nextKrs = existing.keyResults.map((kr) =>
    kr.id === keyResultId ? { ...kr, current } : kr,
  );
  const updated = updateOkr(user.uid, okrId, { keyResults: nextKrs });
  return {
    ...updated,
    progressPercent: computeOkrProgress(updated),
  };
}

export const timeAndOkrHandlers: Record<string, McpToolHandler> = {
  get_active_timer: getActiveTimerHandler,
  start_timer: startTimerHandler,
  stop_timer: stopTimerHandler,
  log_time: logTimeHandler,
  list_okrs: listOkrsHandler,
  create_okr: createOkrHandler,
  update_key_result: updateKeyResultHandler,
  delete_okr: deleteOkrHandler,
};
