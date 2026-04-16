import { getStore } from "../persistence";
import { createNotification, listNotifications } from "./notificationService";
import { flushHourlyDigests, flushDailyDigests } from "./digestService";
import { listAllTodos } from "./todoService";
import type { Todo } from "./todoService";

const REMINDER_INTERVAL_MS = 60 * 60 * 1000; // 1h

/**
 * Effective-due helpers (backend mirror of frontend effectiveDue.ts).
 *
 * Rules mirror the frontend: the earlier of deadline day and slot start wins.
 * "Today" is checked at local-calendar-day granularity; "approaching" uses the
 * raw ISO instant so a slot starting at 09:00 tomorrow triggers the reminder.
 */

/** Local YYYY-MM-DD string for an ISO instant (server's local TZ). */
function toLocalDateStr(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Whether the todo qualifies for a "deadline_today" notification.
 * True when the effective due day (min of deadline day and slot day) == todayStr.
 */
function isEffectiveDueToday(todo: Todo, todayStr: string): boolean {
  const days: string[] = [];
  if (todo.deadline) {
    const d = new Date(todo.deadline);
    if (!isNaN(d.getTime())) days.push(d.toISOString().split("T")[0]);
  }
  if (todo.scheduledSlot?.start) {
    const d = new Date(todo.scheduledSlot.start);
    if (!isNaN(d.getTime())) days.push(toLocalDateStr(todo.scheduledSlot.start));
  }
  // Effective day = min of available days; matches today if any candidate == todayStr
  // and none is earlier (we want the soonest to be today).
  if (days.length === 0) return false;
  const earliest = days.sort()[0];
  return earliest === todayStr;
}

/**
 * Whether the todo qualifies for a "deadline_approaching" notification.
 * True when the effective due instant falls in (now, now + 24h], i.e. the
 * soonest commitment is coming up tomorrow.
 */
function isEffectiveDueApproaching(todo: Todo, now: Date, in24h: Date): boolean {
  const instants: number[] = [];
  if (todo.deadline) {
    const d = new Date(todo.deadline);
    if (!isNaN(d.getTime())) instants.push(d.getTime());
  }
  if (todo.scheduledSlot?.start) {
    const d = new Date(todo.scheduledSlot.start);
    if (!isNaN(d.getTime())) instants.push(d.getTime());
  }
  if (instants.length === 0) return false;
  const earliest = Math.min(...instants);
  return earliest > now.getTime() && earliest <= in24h.getTime();
}

/**
 * Scans all active todos for upcoming deadlines or booked slots and creates
 * in-app notifications. Runs once per hour.
 *
 * A task with only a scheduledSlot (no calendar deadline) now triggers
 * reminders on the same rules as deadline-only tasks:
 *   - slot day == today  → "deadline_today"
 *   - slot start in next 24 h → "deadline_approaching"
 * When both exist the earlier commitment drives the trigger (consistent with
 * frontend effective-due helpers).
 */
function checkDeadlines(): void {
  const store = getStore();
  const todoStore = store.todos ?? {};
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const todayStr = now.toISOString().split("T")[0];

  for (const userId of Object.keys(todoStore)) {
    const notifs = listNotifications(userId);
    const sentToday = new Set(
      notifs
        .filter((n) => n.createdAt.startsWith(todayStr) && n.data?.todoId)
        .map((n) => `${n.type}:${n.data!.todoId}`),
    );

    for (const todo of listAllTodos(userId)) {
      if (todo.status !== "active") continue;
      // Skip tasks with no commitment at all.
      if (!todo.deadline && !todo.scheduledSlot?.start) continue;

      const title = todo.title;
      const todoId = todo.id;

      if (isEffectiveDueToday(todo, todayStr)) {
        if (sentToday.has(`deadline_today:${todoId}`)) continue;
        createNotification(userId, "deadline_today", "Échéance aujourd'hui",
          `La tâche "${title}" arrive à échéance aujourd'hui`, { todoId, todoTitle: title });
        sentToday.add(`deadline_today:${todoId}`);
      } else if (isEffectiveDueApproaching(todo, now, in24h)) {
        if (sentToday.has(`deadline_approaching:${todoId}`)) continue;
        createNotification(userId, "deadline_approaching", "Échéance proche",
          `La tâche "${title}" arrive à échéance demain`, { todoId, todoTitle: title });
        sentToday.add(`deadline_approaching:${todoId}`);
      }
    }
  }
}

let reminderTimer: ReturnType<typeof setInterval> | null = null;

function runHourlyJobs(): void {
  checkDeadlines();
  try { flushHourlyDigests(); } catch (err) { console.warn("[reminders] hourly digest flush failed:", err); }
  try { flushDailyDigests(new Date()); } catch (err) { console.warn("[reminders] daily digest flush failed:", err); }
}

export function startReminderJob(): void {
  console.log("[reminders] Démarrage du job de rappels (intervalle: 1h)");
  runHourlyJobs();
  reminderTimer = setInterval(runHourlyJobs, REMINDER_INTERVAL_MS);
  reminderTimer.unref();
}

export function stopReminderJob(): void {
  if (reminderTimer) { clearInterval(reminderTimer); reminderTimer = null; }
}
