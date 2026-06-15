import type { Notification, NotificationType } from "./notificationService";
import { findTodoForUser, type Todo } from "./todoService";

/** Aligné sur Paramètres → Historique (`getMyActivity` days=7). */
export const NOTIFICATION_DISPLAY_PAST_DAYS = 7;

const UPCOMING_DEADLINE_TYPES = new Set<NotificationType>(["deadline_today", "deadline_approaching"]);

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function deadlineToLocalDayStart(deadline: string): Date | null {
  const trimmed = deadline.trim();
  if (!trimmed) return null;
  const dayOnly = trimmed.includes("T") ? trimmed.split("T")[0]! : trimmed.slice(0, 10);
  const d = new Date(`${dayOnly}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function slotToLocalDayStart(slotStart: string): Date | null {
  const d = new Date(slotStart);
  if (Number.isNaN(d.getTime())) return null;
  return startOfLocalDay(d);
}

/** Earliest local calendar day among deadline and scheduled slot (mirrors frontend effectiveDue). */
export function getEffectiveDueDayStart(todo: Pick<Todo, "deadline" | "scheduledSlot">): Date | null {
  const candidates: Date[] = [];
  if (todo.deadline) {
    const d = deadlineToLocalDayStart(todo.deadline);
    if (d) candidates.push(d);
  }
  if (todo.scheduledSlot?.start) {
    const d = slotToLocalDayStart(todo.scheduledSlot.start);
    if (d) candidates.push(d);
  }
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (a.getTime() <= b.getTime() ? a : b));
}

function isUpcomingDeadlineNotification(notif: Notification, userId: string, todayStart: Date): boolean {
  if (!UPCOMING_DEADLINE_TYPES.has(notif.type)) return false;
  const todoId = notif.data?.todoId;
  if (!todoId) return false;
  const found = findTodoForUser(userId, todoId);
  if (!found || found.todo.status !== "active") return false;
  const dueDay = getEffectiveDueDayStart(found.todo);
  if (!dueDay) return false;
  return dueDay.getTime() >= todayStart.getTime();
}

/**
 * In-app display policy:
 * - rolling window: created within the last NOTIFICATION_DISPLAY_PAST_DAYS days;
 * - plus unread team invites (action required);
 * - plus deadline reminders while the linked task is still due today or later.
 */
export function isNotificationDisplayable(
  notif: Notification,
  userId: string,
  now: Date = new Date(),
): boolean {
  if (!notif.id) return false;

  if (notif.type === "team_invite" && !notif.read) return true;

  const todayStart = startOfLocalDay(now);
  if (isUpcomingDeadlineNotification(notif, userId, todayStart)) return true;

  const createdMs = new Date(notif.createdAt).getTime();
  if (Number.isNaN(createdMs)) return false;
  const cutoffMs = now.getTime() - NOTIFICATION_DISPLAY_PAST_DAYS * 24 * 60 * 60 * 1000;
  return createdMs >= cutoffMs;
}

export function filterNotificationsForDisplay(
  list: Notification[],
  userId: string,
  now?: Date,
): Notification[] {
  return list.filter((n) => isNotificationDisplayable(n, userId, now));
}
