import { deleteGoogleCalendarEvent } from "./googleCalendarService";
import { deleteMicrosoftCalendarEvent } from "./microsoftCalendarService";
import type { Todo } from "./todoService";

/**
 * Fire-and-forget: remove future external calendar events for the given todos (e.g. before project archive/delete purge).
 * Skips todos without a linked event or with a slot in the past (same rule as todoController calendar cleanup).
 */
export function scheduleExternalCleanupForFutureSlots(todos: Todo[]): void {
  for (const todo of todos) {
    if (!todo.scheduledSlot?.calendarEventId) continue;
    if (new Date(todo.scheduledSlot.start).getTime() <= Date.now()) continue;
    deleteExternalBookingForTodo(todo).catch((err) => {
      console.warn(
        "[calendar-cleanup] todoId=%s failed: %s",
        todo.id,
        err instanceof Error ? err.message : String(err),
      );
    });
  }
}

/**
 * Deletes the external calendar event tied to a todo's scheduled slot (Google or Outlook).
 * Tries bookedByUid, then owner, then assignee.
 */
export async function deleteExternalBookingForTodo(todo: Todo): Promise<void> {
  const slot = todo.scheduledSlot;
  const eventId = slot?.calendarEventId;
  if (!eventId) return;

  const provider = slot.bookingProvider ?? "google";
  const calendarId = slot.bookingCalendarId ?? "primary";
  const bookingAccountId = slot.bookingAccountId ?? undefined;
  const booked = slot.bookedByUid;
  const candidates = [booked, todo.userId, todo.assignedTo].filter(
    (u): u is string => typeof u === "string" && u.length > 0,
  );
  const seen = new Set<string>();
  for (const uid of candidates) {
    if (seen.has(uid)) continue;
    seen.add(uid);

    if (provider === "microsoft") {
      if (!bookingAccountId) continue;
      const ok = await deleteMicrosoftCalendarEvent(uid, bookingAccountId, eventId);
      if (ok) return;
    } else {
      const ok = await deleteGoogleCalendarEvent(uid, eventId, calendarId, bookingAccountId);
      if (ok) return;
    }
  }
}
