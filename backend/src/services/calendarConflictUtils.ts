/** Todo-like shape for collecting linked external calendar event ids. */
export type TodoWithScheduledSlot = {
  scheduledSlot?: { calendarEventId?: string | null } | null;
};

/**
 * Collect Google/Outlook event ids already mirrored on Wroket tasks.
 * Used to avoid double-counting the same booking in conflict detection
 * (in-app scheduledSlot + external calendar fetch).
 */
export function collectWroketCalendarEventIds(todos: TodoWithScheduledSlot[]): Set<string> {
  const ids = new Set<string>();
  for (const t of todos) {
    const eid = t.scheduledSlot?.calendarEventId;
    if (eid) ids.add(eid);
  }
  return ids;
}

/** Skip external calendar events that are already represented by a Wroket task slot. */
export function shouldSkipExternalConflictEvent(eventId: string, wroketEventIds: Set<string>): boolean {
  return wroketEventIds.has(eventId);
}
