import type { AuthUser } from "../authService";
import {
  bookTodoSlot,
  clearTodoSlot,
  proposeSlotsForTodo,
} from "../calendarSlotService";
import type { McpToolDef, McpToolHandler } from "./types";
import { requireString } from "./types";

function leanSlotTodo(todo: {
  id: string;
  title: string;
  scheduledSlot: unknown;
  updatedAt: string;
}) {
  return {
    id: todo.id,
    title: todo.title,
    scheduledSlot: todo.scheduledSlot,
    updatedAt: todo.updatedAt,
  };
}

export const calendarToolDefs: McpToolDef[] = [
  {
    name: "propose_slots",
    description:
      "Propose available calendar slots for a task (working hours + busy calendars). Use before book_task_slot.",
    requiredScope: "calendar:write",
    inputSchema: {
      type: "object",
      properties: { todoId: { type: "string" } },
      required: ["todoId"],
    },
  },
  {
    name: "book_task_slot",
    description:
      "Book a start/end ISO slot on a task. On conflict returns conflicts[]; retry with force=true to override (Agenda pattern).",
    requiredScope: "calendar:write",
    inputSchema: {
      type: "object",
      properties: {
        todoId: { type: "string" },
        start: { type: "string", description: "ISO datetime" },
        end: { type: "string", description: "ISO datetime" },
        force: { type: "boolean", description: "Override calendar conflicts" },
      },
      required: ["todoId", "start", "end"],
    },
  },
  {
    name: "clear_task_slot",
    description: "Clear the scheduled slot on a task (and delete external calendar event when present).",
    requiredScope: "calendar:write",
    inputSchema: {
      type: "object",
      properties: { todoId: { type: "string" } },
      required: ["todoId"],
    },
  },
];

async function proposeSlotsHandler(user: AuthUser, args: Record<string, unknown>) {
  const todoId = requireString(args, "todoId");
  const result = await proposeSlotsForTodo(user.uid, user.email, todoId);
  return {
    todoId,
    duration: result.duration,
    durationSource: result.durationSource,
    effort: result.effort,
    todayAvailability: result.todayAvailability,
    effectiveStartDate: result.effectiveStartDate,
    suggestedSlot: result.suggestedSlot,
    slots: result.slots.slice(0, 6).map((s) => ({
      start: s.start,
      end: s.end,
      label: s.label,
      reasonCode: s.reasonCode ?? null,
    })),
  };
}

async function bookSlotHandler(user: AuthUser, args: Record<string, unknown>) {
  const todoId = requireString(args, "todoId");
  const start = requireString(args, "start");
  const end = requireString(args, "end");
  const force = args.force === true;
  const result = await bookTodoSlot(user.uid, user.email, todoId, { start, end, force });
  if (!result.ok) {
    return {
      conflict: true,
      code: result.code,
      conflicts: result.conflicts,
      hint: "Retry book_task_slot with force=true to override, or pick another slot from propose_slots.",
    };
  }
  return { booked: true, todo: leanSlotTodo(result.todo) };
}

async function clearSlotHandler(user: AuthUser, args: Record<string, unknown>) {
  const todoId = requireString(args, "todoId");
  const todo = await clearTodoSlot(user.uid, user.email, todoId);
  return { cleared: true, todo: leanSlotTodo(todo) };
}

export const calendarHandlers: Record<string, McpToolHandler> = {
  propose_slots: proposeSlotsHandler,
  book_task_slot: bookSlotHandler,
  clear_task_slot: clearSlotHandler,
};
