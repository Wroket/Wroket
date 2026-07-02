import { findUserByUid, DEFAULT_WORKING_HOURS } from "./authService";
import {
  patchGoogleCalendarEvent,
  WROKET_CALENDAR_BOOKING_NOTE,
} from "./googleCalendarService";
import { patchMicrosoftCalendarEvent } from "./microsoftCalendarService";
import type { Todo } from "./todoService";
import {
  recurrenceChanged,
  wroketRecurrenceToGoogleRrule,
  wroketRecurrenceToMicrosoftRecurrence,
} from "../utils/calendarRecurrence";

/**
 * Best-effort sync of Wroket task recurrence to the linked external calendar event.
 * Does not throw — callers should not fail PUT/booking on sync errors.
 */
export async function syncTodoRecurrenceToExternalCalendar(
  uid: string,
  _email: string,
  todo: Todo,
  previousTodo?: Todo | null,
  tz?: string,
): Promise<void> {
  const slot = todo.scheduledSlot;
  const eventId = slot?.calendarEventId;
  if (!eventId || todo.status !== "active") return;

  if (previousTodo && !recurrenceChanged(previousTodo.recurrence, todo.recurrence)) {
    return;
  }

  const actorUid = slot.bookedByUid ?? uid;
  const userTz =
    tz ??
    findUserByUid(actorUid)?.workingHours?.timezone ??
    findUserByUid(uid)?.workingHours?.timezone ??
    DEFAULT_WORKING_HOURS.timezone;

  const provider = slot.bookingProvider ?? "google";
  const bookingCalendarId = slot.bookingCalendarId ?? "primary";
  const bookingAccountId = slot.bookingAccountId ?? undefined;
  const hasMeet = !!slot.meetingUrl;

  try {
    if (provider === "google") {
      const recurrence = todo.recurrence
        ? wroketRecurrenceToGoogleRrule(todo.recurrence, slot.start, userTz)
        : null;
      const ok = await patchGoogleCalendarEvent(
        actorUid,
        eventId,
        todo.title,
        slot.start,
        slot.end,
        userTz,
        WROKET_CALENDAR_BOOKING_NOTE,
        bookingCalendarId,
        bookingAccountId,
        hasMeet ? (slot.meetingInvitees ?? undefined) : undefined,
        { preserveConference: hasMeet },
        recurrence,
      );
      if (!ok) {
        console.warn(
          "[calendar-recurrence-sync] Google patch failed",
          JSON.stringify({ todoId: todo.id, eventId }),
        );
      }
      return;
    }

    if (provider === "microsoft") {
      if (!bookingAccountId) {
        console.warn(
          "[calendar-recurrence-sync] Microsoft bookingAccountId missing",
          JSON.stringify({ todoId: todo.id }),
        );
        return;
      }
      const recurrence = todo.recurrence
        ? wroketRecurrenceToMicrosoftRecurrence(todo.recurrence, slot.start, userTz)
        : null;
      const ok = await patchMicrosoftCalendarEvent(
        actorUid,
        bookingAccountId,
        eventId,
        todo.title,
        slot.start,
        slot.end,
        undefined,
        hasMeet ? (slot.meetingInvitees ?? undefined) : undefined,
        hasMeet && slot.meetingUrl
          ? { joinUrl: slot.meetingUrl, responseRequested: true }
          : undefined,
        recurrence,
      );
      if (!ok) {
        console.warn(
          "[calendar-recurrence-sync] Microsoft patch failed",
          JSON.stringify({ todoId: todo.id, eventId }),
        );
      }
    }
  } catch (err) {
    console.warn(
      "[calendar-recurrence-sync] unexpected error",
      JSON.stringify({
        todoId: todo.id,
        eventId,
        message: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
