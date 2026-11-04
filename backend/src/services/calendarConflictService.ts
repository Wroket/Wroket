import {
  collectWroketCalendarEventIds,
  shouldSkipExternalConflictEvent,
} from "./calendarConflictUtils";
import {
  collectEnabledExternalCalendars,
} from "./calendarEnabledCalendars";
import {
  findUserByUid,
} from "./authService";
import { getEffectiveEntitlementsForUid } from "./teamService";
import { listEventsForAccount } from "./googleCalendarService";
import { listMicrosoftEventsForAccount } from "./microsoftCalendarService";
import { listAssignedToMe, listTodos, type Todo } from "./todoService";

export interface SlotConflictInfo {
  id: string;
  title: string;
  start: string;
  end: string;
}

/** Detect Wroket + external calendar overlaps for a time range (shared by bookSlot and moveTodo). */
export async function findSlotConflicts(
  uid: string,
  todoId: string,
  start: Date,
  end: Date,
  userEmail?: string,
): Promise<SlotConflictInfo[]> {
  const conflicts: SlotConflictInfo[] = [];
  const email = userEmail ?? findUserByUid(uid)?.email ?? "";
  const extCal = getEffectiveEntitlementsForUid(uid, email).integrations;

  const ownedTodos = await listTodos(uid);
  const assignedTodos = await listAssignedToMe(uid);
  const wroketExternalIds = collectWroketCalendarEventIds([...ownedTodos, ...assignedTodos]);

  const checkTodo = (t: Todo) => {
    if (t.id === todoId || t.status !== "active" || !t.scheduledSlot) return;
    const sStart = new Date(t.scheduledSlot.start);
    const sEnd = new Date(t.scheduledSlot.end);
    if (start < sEnd && end > sStart) {
      conflicts.push({ id: t.id, title: t.title, start: t.scheduledSlot.start, end: t.scheduledSlot.end });
    }
  };

  for (const t of ownedTodos) checkTodo(t);
  for (const t of assignedTodos) checkTodo(t);

  if (!extCal) return conflicts;

  const enabled = collectEnabledExternalCalendars(uid);
  const timeMin = start.toISOString();
  const timeMax = end.toISOString();

  const googleFetches = enabled
    .filter((c) => c.provider === "google")
    .map((c) => listEventsForAccount(uid, c.accountId, c.calendarId, timeMin, timeMax).catch(() => []));

  const msFetches = enabled
    .filter((c) => c.provider === "microsoft")
    .map((c) =>
      listMicrosoftEventsForAccount(uid, c.accountId, c.calendarId, timeMin, timeMax).catch(() => []),
    );

  try {
    const [googleResults, msResults] = await Promise.all([
      Promise.all(googleFetches),
      Promise.all(msFetches),
    ]);
    for (const events of googleResults) {
      for (const ev of events) {
        if (ev.allDay) continue;
        if (shouldSkipExternalConflictEvent(ev.id, wroketExternalIds)) continue;
        const evStart = new Date(ev.start);
        const evEnd = new Date(ev.end);
        if (start < evEnd && end > evStart) {
          conflicts.push({ id: ev.id, title: ev.summary, start: ev.start, end: ev.end });
        }
      }
    }
    for (const events of msResults) {
      for (const ev of events) {
        if (ev.allDay) continue;
        if (shouldSkipExternalConflictEvent(ev.id, wroketExternalIds)) continue;
        const evStart = new Date(ev.start);
        const evEnd = new Date(ev.end);
        if (start < evEnd && end > evStart) {
          conflicts.push({ id: `ms:${ev.id}`, title: ev.summary, start: ev.start, end: ev.end });
        }
      }
    }
  } catch {
    /* External calendars unavailable */
  }

  return conflicts;
}
