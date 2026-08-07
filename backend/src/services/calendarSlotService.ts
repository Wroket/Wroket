import { findAvailableSlots } from "./calendarService";
import { findSlotConflicts } from "./calendarConflictService";
import { getEffectiveEntitlementsForUid } from "./teamService";
import { findPhaseById } from "./projectService";
import {
  DEFAULT_WORKING_HOURS,
  findUserByUid,
  getGoogleAccounts,
  getMicrosoftAccounts,
  resolveBookingTarget,
} from "./authService";
import { logActivity } from "./activityLogService";
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  listEventsForAccount,
  patchGoogleCalendarEvent,
} from "./googleCalendarService";
import {
  createMicrosoftCalendarEvent,
  deleteMicrosoftCalendarEvent,
  getDefaultMicrosoftCalendarId,
  listMicrosoftEventsForAccount,
  patchMicrosoftCalendarEvent,
} from "./microsoftCalendarService";
import { deleteExternalBookingForTodo } from "./calendarBookingCleanup";
import { syncTodoRecurrenceToExternalCalendar } from "./calendarRecurrenceSync";
import {
  ensureOwnerHydrated,
  findTodoForUser,
  listTodos,
  updateTodo,
  type Todo,
} from "./todoService";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";

export type SlotConflictInfo = { id: string; title: string; start: string; end: string };

export type BookTodoSlotResult =
  | { ok: true; todo: Todo }
  | { ok: false; code: "CALENDAR_SLOT_CONFLICT"; conflicts: SlotConflictInfo[] };

export interface ProposeSlotsResult {
  slots: Awaited<ReturnType<typeof findAvailableSlots>>["slots"];
  duration: number;
  durationSource: "task" | "settings";
  effort: string;
  suggestedSlot: Todo["suggestedSlot"];
  todayAvailability: Awaited<ReturnType<typeof findAvailableSlots>>["todayAvailability"];
  effectiveStartDate: string | null;
}

/**
 * Propose available slots for a task (same engine as GET /calendar/slots/:todoId).
 */
export async function proposeSlotsForTodo(
  uid: string,
  email: string,
  todoId: string,
): Promise<ProposeSlotsResult> {
  await ensureOwnerHydrated(uid);

  const found = await findTodoForUser(uid, todoId);
  if (!found) throw new NotFoundError("Tâche introuvable");
  const { todo } = found;

  const user = findUserByUid(uid);
  const workingHours = user?.workingHours ?? DEFAULT_WORKING_HOURS;

  const effortDefaults = user?.effortMinutes ?? { light: 10, medium: 30, heavy: 60 };
  const effort = todo.effort ?? "medium";
  const hasCustomEstimate = todo.estimatedMinutes != null;
  const duration = hasCustomEstimate ? todo.estimatedMinutes! : effortDefaults[effort];
  const durationSource = hasCustomEstimate ? ("task" as const) : ("settings" as const);

  const googleBusySlots: { start: Date; end: Date }[] = [];
  const extCal = getEffectiveEntitlementsForUid(uid, email).integrations;
  const accounts = getGoogleAccounts(uid);
  if (extCal && accounts.length > 0) {
    const now = new Date();
    const searchEnd = new Date(now.getTime() + 31 * 24 * 3600_000);
    const fetches: Promise<{ start: string; end: string; allDay: boolean }[]>[] = [];
    for (const account of accounts) {
      for (const cal of account.calendars) {
        if (!cal.enabled || fetches.length >= 10) continue;
        fetches.push(
          listEventsForAccount(uid, account.id, cal.calendarId, now.toISOString(), searchEnd.toISOString()),
        );
      }
    }
    try {
      const results = await Promise.all(fetches);
      for (const events of results) {
        for (const ev of events) {
          if (ev.allDay) continue;
          googleBusySlots.push({ start: new Date(ev.start), end: new Date(ev.end) });
        }
      }
    } catch {
      /* Google Calendar unavailable */
    }
  }

  const msAccounts = getMicrosoftAccounts(uid);
  if (extCal && msAccounts.length > 0) {
    const now = new Date();
    const searchEnd = new Date(now.getTime() + 31 * 24 * 3600_000);
    const msFetches: Promise<{ start: string; end: string; allDay: boolean }[]>[] = [];
    for (const account of msAccounts) {
      for (const cal of account.calendars) {
        if (!cal.enabled || msFetches.length >= 10) continue;
        msFetches.push(
          listMicrosoftEventsForAccount(uid, account.id, cal.calendarId, now.toISOString(), searchEnd.toISOString()).then(
            (events) => events.map((e) => ({ start: e.start, end: e.end, allDay: e.allDay })),
          ),
        );
      }
    }
    try {
      const results = await Promise.all(msFetches);
      for (const events of results) {
        for (const ev of events) {
          if (ev.allDay) continue;
          googleBusySlots.push({ start: new Date(ev.start), end: new Date(ev.end) });
        }
      }
    } catch {
      /* Outlook unavailable */
    }
  }

  let effectiveStartDate = todo.startDate;
  let effectiveDeadline = todo.deadline;
  if (todo.phaseId) {
    const phase = findPhaseById(todo.phaseId);
    if (phase) {
      if (phase.startDate && (!effectiveStartDate || effectiveStartDate < phase.startDate)) {
        effectiveStartDate = phase.startDate;
      }
      if (phase.endDate && (!effectiveDeadline || effectiveDeadline > phase.endDate)) {
        effectiveDeadline = phase.endDate;
      }
    }
  }

  if (effectiveStartDate && effectiveDeadline && effectiveStartDate > effectiveDeadline) {
    effectiveStartDate = todo.startDate;
    effectiveDeadline = todo.deadline;
  }

  const ctx = {
    priority: todo.priority,
    deadline: effectiveDeadline,
    startDate: effectiveStartDate,
    effort: todo.effort ?? "medium",
  };
  const { slots, todayAvailability } = await findAvailableSlots(
    uid,
    duration,
    workingHours,
    googleBusySlots,
    6,
    undefined,
    ctx,
  );
  if (slots.length === 0) {
    const occupied = (await listTodos(uid)).filter((t) => t.scheduledSlot).length;
    console.log(
      `[proposeSlots] 0 slots for todo=${todoId} title="${todo.title}" duration=${duration}min busySlots=${googleBusySlots.length} occupiedTasks=${occupied}`,
    );
  }

  return {
    slots,
    duration,
    durationSource,
    effort,
    suggestedSlot: todo.suggestedSlot ?? null,
    todayAvailability,
    effectiveStartDate: effectiveStartDate ?? null,
  };
}

/**
 * Book a slot on a task (same logic as POST /calendar/book/:todoId).
 * Returns `{ ok: false, conflicts }` when force is false and overlaps exist.
 */
export async function bookTodoSlot(
  uid: string,
  email: string,
  todoId: string,
  input: { start: string; end: string; force?: boolean },
): Promise<BookTodoSlotResult> {
  const { start, end, force } = input;

  if (!start || !end) throw new ValidationError("start and end required", "CALENDAR_SLOT_MISSING_RANGE");
  if (typeof start !== "string" || typeof end !== "string") {
    throw new ValidationError("start and end must be strings", "CALENDAR_SLOT_RANGE_TYPE");
  }
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw new ValidationError("Invalid date format", "CALENDAR_SLOT_INVALID_DATE");
  }
  if (startDate >= endDate) throw new ValidationError("start must be before end", "CALENDAR_SLOT_INVALID_RANGE");

  const MAX_SLOT_DAYS = 7;
  if (endDate.getTime() - startDate.getTime() > MAX_SLOT_DAYS * 24 * 3600_000) {
    throw new ValidationError("Slot duration too long", "CALENDAR_SLOT_TOO_LONG");
  }

  await ensureOwnerHydrated(uid);

  const found = await findTodoForUser(uid, todoId);
  if (!found) throw new NotFoundError("Tâche introuvable", "CALENDAR_TODO_NOT_FOUND");
  const { todo } = found;

  if (!force) {
    const conflicts = await findSlotConflicts(uid, todoId, startDate, endDate);
    if (conflicts.length > 0) {
      return {
        ok: false,
        code: "CALENDAR_SLOT_CONFLICT",
        conflicts: conflicts.slice(0, 10).map((c) => ({
          id: c.id,
          title: c.title.slice(0, 100),
          start: c.start,
          end: c.end,
        })),
      };
    }
  }

  let calendarEventId: string | null = null;
  let bookingCalendarId: string | null = null;
  let bookingAccountId: string | null = null;
  let bookingProvider: "google" | "microsoft" | undefined;

  const hasCalendarIntegration =
    getGoogleAccounts(uid).length > 0 || getMicrosoftAccounts(uid).length > 0;
  const bookingTarget = resolveBookingTarget(uid);

  if (bookingTarget && !getEffectiveEntitlementsForUid(uid, email).integrations) {
    throw new ForbiddenError(
      "La réservation sur Google Calendar ou Outlook nécessite le palier Small teams (pack intégrations) ou le statut early bird (attribué par un administrateur).",
      "CALENDAR_INTEGRATIONS_PLAN_REQUIRED",
    );
  }

  if (hasCalendarIntegration && !bookingTarget) {
    throw new ValidationError(
      "Configurez un calendrier par défaut pour la réservation (Mes agendas).",
      "CALENDAR_DEFAULT_BOOKING_REQUIRED",
    );
  }

  const user = findUserByUid(uid);
  const tz = user?.workingHours?.timezone ?? DEFAULT_WORKING_HOURS.timezone;

  if (bookingTarget) {
    bookingCalendarId = bookingTarget.calendarId;
    bookingAccountId = bookingTarget.accountId;
    bookingProvider = bookingTarget.provider;

    let existingEventId = todo.scheduledSlot?.calendarEventId ?? null;
    let existingProvider = todo.scheduledSlot?.bookingProvider ?? "google";

    if (existingEventId && existingProvider !== bookingTarget.provider) {
      await deleteExternalBookingForTodo(todo);
      existingEventId = null;
    }

    if (bookingTarget.provider === "google") {
      const googleTarget = { accountId: bookingTarget.accountId, calendarId: bookingTarget.calendarId };
      if (existingEventId && existingProvider === "google") {
        const existingBookingCalendarId =
          todo.scheduledSlot?.bookingCalendarId ?? bookingCalendarId ?? "primary";
        const existingBookingAccountId = todo.scheduledSlot?.bookingAccountId ?? bookingAccountId;
        const hasMeet = !!todo.scheduledSlot?.meetingUrl;
        const patched = await patchGoogleCalendarEvent(
          uid,
          existingEventId,
          todo.title,
          start,
          end,
          tz,
          undefined,
          existingBookingCalendarId,
          existingBookingAccountId ?? undefined,
          hasMeet ? (todo.scheduledSlot?.meetingInvitees ?? undefined) : undefined,
          { preserveConference: hasMeet },
        );
        if (patched) {
          calendarEventId = existingEventId;
          bookingCalendarId = existingBookingCalendarId;
          bookingAccountId = existingBookingAccountId;
        } else {
          await deleteGoogleCalendarEvent(
            uid,
            existingEventId,
            existingBookingCalendarId,
            existingBookingAccountId ?? undefined,
          );
          calendarEventId = await createGoogleCalendarEvent(
            uid,
            todo.title,
            start,
            end,
            tz,
            undefined,
            googleTarget,
          );
        }
      } else {
        calendarEventId = await createGoogleCalendarEvent(
          uid,
          todo.title,
          start,
          end,
          tz,
          undefined,
          googleTarget,
        );
      }
      if (!calendarEventId) {
        throw new ValidationError(
          "Impossible de créer l'événement Google Calendar. Vérifiez la connexion et le calendrier par défaut.",
        );
      }
    } else {
      const msAccountId = bookingTarget.accountId;
      let msCalId =
        typeof bookingTarget.calendarId === "string" ? bookingTarget.calendarId.trim() : "";
      if (!msCalId) {
        const resolved = await getDefaultMicrosoftCalendarId(uid, msAccountId);
        if (!resolved) {
          throw new ValidationError(
            "Impossible de déterminer le calendrier Outlook par défaut. Ouvrez Mes agendas, sélectionnez un calendrier, puis réessayez.",
          );
        }
        msCalId = resolved;
      }
      if (existingEventId && existingProvider === "microsoft") {
        const patchAccountId = todo.scheduledSlot?.bookingAccountId ?? msAccountId;
        const patched = await patchMicrosoftCalendarEvent(
          uid,
          patchAccountId,
          existingEventId,
          todo.title,
          start,
          end,
        );
        if (patched) {
          calendarEventId = existingEventId;
          bookingAccountId = patchAccountId;
          bookingCalendarId = todo.scheduledSlot?.bookingCalendarId ?? msCalId;
        } else {
          await deleteMicrosoftCalendarEvent(uid, patchAccountId, existingEventId).catch(() => null);
          calendarEventId = await createMicrosoftCalendarEvent(
            uid,
            msAccountId,
            msCalId,
            todo.title,
            start,
            end,
          );
          bookingAccountId = msAccountId;
          bookingCalendarId = msCalId;
        }
      } else {
        calendarEventId = await createMicrosoftCalendarEvent(
          uid,
          msAccountId,
          msCalId,
          todo.title,
          start,
          end,
        );
      }
      if (!calendarEventId) {
        throw new ValidationError(
          "Impossible de créer l'événement Outlook. Vérifiez la connexion et le calendrier par défaut.",
        );
      }
      bookingAccountId = msAccountId;
      bookingCalendarId = msCalId;
    }
  }

  let updated: Todo;
  try {
    updated = await updateTodo(uid, email, todoId, {
      scheduledSlot: {
        start,
        end,
        calendarEventId,
        bookedByUid: uid,
        bookingCalendarId,
        bookingAccountId,
        ...(bookingProvider ? { bookingProvider } : {}),
      },
    });
  } catch (err) {
    if (calendarEventId && bookingProvider && bookingAccountId) {
      if (bookingProvider === "google") {
        await deleteGoogleCalendarEvent(uid, bookingAccountId, calendarEventId).catch(() => null);
      } else if (bookingProvider === "microsoft") {
        await deleteMicrosoftCalendarEvent(uid, bookingAccountId, calendarEventId).catch(() => null);
      }
    }
    throw err;
  }

  if (updated.recurrence) {
    syncTodoRecurrenceToExternalCalendar(uid, email, updated, undefined, tz).catch((err) => {
      console.warn("[calendar.bookTodoSlot] recurrence sync failed:", err);
    });
  }

  try {
    logActivity(uid, email, "slot_booked", "todo", todoId, {
      todoId,
      title: updated.title,
      start,
      end,
      bookingProvider: bookingProvider ?? null,
      calendarEventId,
    });
  } catch (err) {
    console.warn("[calendar.bookTodoSlot] activity log failed:", err);
  }

  return { ok: true, todo: updated };
}

/**
 * Clear a task's scheduled slot (same logic as DELETE /calendar/slot/:todoId).
 */
export async function clearTodoSlot(uid: string, email: string, todoId: string): Promise<Todo> {
  await ensureOwnerHydrated(uid);

  const found = await findTodoForUser(uid, todoId);
  if (!found) throw new NotFoundError("Tâche introuvable");
  const { todo } = found;

  if (todo.scheduledSlot?.calendarEventId) {
    await deleteExternalBookingForTodo(todo);
  }

  const updated = await updateTodo(uid, email, todoId, {
    scheduledSlot: null,
  });
  try {
    logActivity(uid, email, "slot_cleared", "todo", todoId, {
      todoId,
      title: updated.title,
      previousCalendarEventId: todo.scheduledSlot?.calendarEventId ?? null,
    });
  } catch (err) {
    console.warn("[calendar.clearTodoSlot] activity log failed:", err);
  }
  return updated;
}
