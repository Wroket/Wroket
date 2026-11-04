import {
  DEFAULT_WORKING_HOURS,
  findUserByUid,
  getGoogleAccounts,
  getMicrosoftAccounts,
  resolveBookingTarget,
  type AuthUser,
} from "../authService";
import { deleteExternalBookingForTodo } from "../calendarBookingCleanup";
import {
  bookTodoSlot,
  clearTodoSlot,
  proposeSlotsForTodo,
} from "../calendarSlotService";
import {
  createGoogleMeetEvent,
  listEventsForAccount,
  mapGoogleMeetCreateError,
  WROKET_CALENDAR_BOOKING_NOTE,
} from "../googleCalendarService";
import {
  createMicrosoftTeamsCalendarEvent,
  getDefaultMicrosoftCalendarId,
  listMicrosoftEventsForAccount,
  mapMicrosoftTeamsMeetCreateError,
} from "../microsoftCalendarService";
import { getEffectiveEntitlementsForUid } from "../teamService";
import {
  findTodoForUser,
  listAssignedToMe,
  listTodos,
  updateTodo,
} from "../todoService";
import { ForbiddenError, NotFoundError, ValidationError } from "../../utils/errors";
import type { McpToolDef, McpToolHandler } from "./types";
import { optionalString, requireString } from "./types";

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
  {
    name: "list_calendar_events",
    description:
      "List agenda events (Wroket scheduled task slots + connected Google Calendar and Microsoft Outlook events) for a date range (defaults to the next 7 days).",
    requiredScope: "todos:read",
    inputSchema: {
      type: "object",
      properties: {
        start: { type: "string", description: "Optional ISO start datetime (default: now)" },
        end: { type: "string", description: "Optional ISO end datetime (default: +7 days, max 90 days)" },
      },
    },
  },
  {
    name: "schedule_task_meeting",
    description:
      "Create a Google Meet or Microsoft Teams video meeting linked to a task, invite attendees by email, and store the meetingUrl on the task's scheduledSlot (Small teams+ with connected Google Calendar or Outlook).",
    requiredScope: "calendar:write",
    inputSchema: {
      type: "object",
      properties: {
        todoId: { type: "string", description: "Task id" },
        start: { type: "string", description: "ISO start datetime (optional if task already has a slot)" },
        end: { type: "string", description: "ISO end datetime (optional if task already has a slot)" },
        attendees: {
          type: "array",
          items: { type: "string" },
          description: "Optional list of invitee email addresses",
        },
        summary: { type: "string", description: "Optional meeting title (defaults to task title)" },
        description: { type: "string", description: "Optional meeting agenda/description" },
      },
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

async function listCalendarEventsHandler(user: AuthUser, args: Record<string, unknown>) {
  const now = new Date();
  const startStr = optionalString(args, "start") ?? now.toISOString();
  const endStr =
    optionalString(args, "end") ??
    new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const startDate = new Date(startStr);
  const endDate = new Date(endStr);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate >= endDate) {
    throw new ValidationError("Plage start/end invalide");
  }
  if (endDate.getTime() - startDate.getTime() > 90 * 24 * 60 * 60 * 1000) {
    throw new ValidationError("Plage maximale : 90 jours");
  }

  const [owned, assigned] = await Promise.all([
    listTodos(user.uid),
    listAssignedToMe(user.uid),
  ]);

  const seenTodoIds = new Set<string>();
  const wroketEvents: Array<Record<string, unknown>> = [];
  for (const t of [...owned, ...assigned]) {
    if (seenTodoIds.has(t.id) || t.status !== "active" || !t.scheduledSlot) continue;
    seenTodoIds.add(t.id);
    const sMs = Date.parse(t.scheduledSlot.start);
    const eMs = Date.parse(t.scheduledSlot.end);
    if (Number.isFinite(sMs) && Number.isFinite(eMs)) {
      if (eMs < startDate.getTime() || sMs > endDate.getTime()) continue;
    }
    wroketEvents.push({
      id: t.id,
      todoId: t.id,
      summary: t.title,
      start: t.scheduledSlot.start,
      end: t.scheduledSlot.end,
      source: "wroket",
      priority: t.priority,
      projectId: t.projectId,
      meetingUrl: t.scheduledSlot.meetingUrl ?? null,
      meetingProvider: t.scheduledSlot.meetingProvider ?? null,
    });
  }

  const externalEvents: Array<Record<string, unknown>> = [];
  const hasExternalEntitlement = getEffectiveEntitlementsForUid(user.uid, user.email).integrations;
  if (hasExternalEntitlement) {
    for (const acc of getGoogleAccounts(user.uid).slice(0, 5)) {
      const cals = acc.calendars.filter((c) => c.enabled);
      const targets = cals.length > 0 ? cals.map((c) => c.calendarId) : ["primary"];
      for (const calId of targets.slice(0, 5)) {
        const evs = await listEventsForAccount(user.uid, acc.id, calId, startStr, endStr).catch(
          () => [],
        );
        for (const e of evs) {
          externalEvents.push({
            id: e.id,
            summary: e.summary,
            start: e.start,
            end: e.end,
            allDay: e.allDay,
            source: "google",
            accountEmail: acc.email,
          });
        }
      }
    }
    for (const acc of getMicrosoftAccounts(user.uid).slice(0, 5)) {
      const cals = acc.calendars.filter((c) => c.enabled);
      for (const cal of cals.slice(0, 5)) {
        const evs = await listMicrosoftEventsForAccount(
          user.uid,
          acc.id,
          cal.calendarId,
          startStr,
          endStr,
        ).catch(() => []);
        for (const e of evs) {
          externalEvents.push({
            id: e.id,
            summary: e.summary,
            start: e.start,
            end: e.end,
            allDay: e.allDay,
            source: "microsoft",
            accountEmail: acc.email,
          });
        }
      }
    }
  }

  return {
    start: startStr,
    end: endStr,
    wroketSlots: wroketEvents,
    externalEvents,
  };
}

async function scheduleTaskMeetingHandler(user: AuthUser, args: Record<string, unknown>) {
  const todoId = requireString(args, "todoId");
  if (!getEffectiveEntitlementsForUid(user.uid, user.email).integrations) {
    throw new ForbiddenError(
      "Google Meet / Microsoft Teams nécessite le palier Small teams+ ou Early Bird.",
      "CALENDAR_INTEGRATIONS_PLAN_REQUIRED",
    );
  }
  const bookingTarget = resolveBookingTarget(user.uid);
  if (!bookingTarget) {
    throw new ValidationError(
      "Aucun calendrier externe (Google Calendar ou Outlook) n'est connecté pour créer une réunion.",
    );
  }

  const found = await findTodoForUser(user.uid, todoId);
  if (!found) throw new NotFoundError("Tâche introuvable");
  const { todo } = found;

  const requestStart = optionalString(args, "start");
  const requestEnd = optionalString(args, "end");
  if ((requestStart && !requestEnd) || (!requestStart && requestEnd)) {
    throw new ValidationError("start et end doivent être fournis ensemble", "MEET_INVALID_RANGE");
  }
  const now = new Date();
  const slotStart = requestStart ?? todo.scheduledSlot?.start ?? now.toISOString();
  const slotEnd =
    requestEnd ??
    todo.scheduledSlot?.end ??
    new Date(now.getTime() + 60 * 60 * 1000).toISOString();

  const attendees = Array.isArray(args.attendees)
    ? args.attendees
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim().toLowerCase())
        .filter((v) => v.includes("@") && v.length >= 5)
        .slice(0, 50)
    : [];
  const summary = (optionalString(args, "summary") ?? todo.title).slice(0, 200);
  const description = optionalString(args, "description")?.slice(0, 5000);
  const profile = findUserByUid(user.uid);
  const tz = profile?.workingHours?.timezone ?? DEFAULT_WORKING_HOURS.timezone;

  if (todo.scheduledSlot?.calendarEventId) {
    await deleteExternalBookingForTodo(todo).catch(() => null);
  }

  if (bookingTarget.provider === "google") {
    let result: { eventId: string; meetingUrl: string } | null = null;
    try {
      result = await createGoogleMeetEvent(
        user.uid,
        summary,
        slotStart,
        slotEnd,
        tz,
        description,
        attendees,
        { accountId: bookingTarget.accountId, calendarId: bookingTarget.calendarId },
      );
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Erreur Google Calendar";
      throw new ValidationError(`Impossible de créer la réunion Google Meet. ${mapGoogleMeetCreateError(raw)}`);
    }
    if (!result) {
      throw new ValidationError("Impossible de créer la réunion Google Meet.");
    }
    const updated = await updateTodo(user.uid, user.email, todoId, {
      scheduledSlot: {
        start: slotStart,
        end: slotEnd,
        calendarEventId: result.eventId,
        bookedByUid: user.uid,
        bookingCalendarId: bookingTarget.calendarId ?? "primary",
        bookingAccountId: bookingTarget.accountId ?? null,
        bookingProvider: "google",
        meetingUrl: result.meetingUrl,
        meetingInvitees: attendees,
        meetingProvider: "google-meet",
      },
    });
    return {
      scheduled: true,
      provider: "google-meet",
      meetingUrl: result.meetingUrl,
      todo: leanSlotTodo(updated),
    };
  }

  let msCalId = typeof bookingTarget.calendarId === "string" ? bookingTarget.calendarId.trim() : "";
  if (!msCalId) {
    msCalId = (await getDefaultMicrosoftCalendarId(user.uid, bookingTarget.accountId)) ?? "";
    if (!msCalId) {
      throw new ValidationError("Impossible de déterminer le calendrier Outlook par défaut.");
    }
  }
  let teamsResult: { eventId: string; joinUrl: string };
  try {
    teamsResult = await createMicrosoftTeamsCalendarEvent(
      user.uid,
      bookingTarget.accountId,
      msCalId,
      summary,
      slotStart,
      slotEnd,
      description ?? WROKET_CALENDAR_BOOKING_NOTE,
      attendees,
    );
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Erreur Microsoft Graph";
    throw new ValidationError(`Impossible de créer la réunion Microsoft Teams. ${mapMicrosoftTeamsMeetCreateError(raw)}`);
  }
  const updated = await updateTodo(user.uid, user.email, todoId, {
    scheduledSlot: {
      start: slotStart,
      end: slotEnd,
      calendarEventId: teamsResult.eventId,
      bookedByUid: user.uid,
      bookingCalendarId: msCalId,
      bookingAccountId: bookingTarget.accountId,
      bookingProvider: "microsoft",
      meetingUrl: teamsResult.joinUrl,
      meetingInvitees: attendees,
      meetingProvider: "microsoft-teams",
    },
  });
  return {
    scheduled: true,
    provider: "microsoft-teams",
    meetingUrl: teamsResult.joinUrl,
    todo: leanSlotTodo(updated),
  };
}

export const calendarHandlers: Record<string, McpToolHandler> = {
  propose_slots: proposeSlotsHandler,
  book_task_slot: bookSlotHandler,
  clear_task_slot: clearSlotHandler,
  list_calendar_events: listCalendarEventsHandler,
  schedule_task_meeting: scheduleTaskMeetingHandler,
};
