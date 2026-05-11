import { deleteGoogleCalendarEvent } from "./googleCalendarService";
import { deleteMicrosoftCalendarEvent } from "./microsoftCalendarService";
import type { Todo } from "./todoService";

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
