import {
  collectWroketCalendarEventIds,
  shouldSkipExternalConflictEvent,
} from "./calendarConflictUtils";
import {
  getGoogleAccounts,
  getMicrosoftAccounts,
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

const MAX_CONFLICT_CALENDAR_FETCHES = 10;

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

  const accounts = getGoogleAccounts(uid);
  if (extCal && accounts.length > 0) {
    const timeMin = start.toISOString();
    const timeMax = end.toISOString();
    const fetches: Promise<{ id: string; summary: string; start: string; end: string; allDay: boolean }[]>[] = [];
    for (const account of accounts) {
      for (const cal of account.calendars) {
        if (!cal.enabled || fetches.length >= MAX_CONFLICT_CALENDAR_FETCHES) continue;
        fetches.push(listEventsForAccount(uid, account.id, cal.calendarId, timeMin, timeMax));
      }
    }
    try {
      const results = await Promise.all(fetches);
      for (const events of results) {
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
    } catch {
      /* Google Calendar unavailable */
    }
  }

  const msAccounts = getMicrosoftAccounts(uid);
  if (extCal && msAccounts.length > 0) {
    const timeMin = start.toISOString();
    const timeMax = end.toISOString();
    const msFetches: Promise<{ id: string; summary: string; start: string; end: string; allDay: boolean }[]>[] = [];
    for (const account of msAccounts) {
      for (const cal of account.calendars) {
        if (!cal.enabled || msFetches.length >= MAX_CONFLICT_CALENDAR_FETCHES) continue;
        msFetches.push(
          listMicrosoftEventsForAccount(uid, account.id, cal.calendarId, timeMin, timeMax).catch(() => []),
        );
      }
    }
    try {
      const results = await Promise.all(msFetches);
      for (const events of results) {
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
      /* Outlook unavailable */
    }
  }

  return conflicts;
}
