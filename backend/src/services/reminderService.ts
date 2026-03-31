import { getStore } from "../persistence";
import { createNotification, listNotifications } from "./notificationService";

const REMINDER_INTERVAL_MS = 60 * 60 * 1000; // 1h

/**
 * Check if a deadline reminder was already sent today for this user+todo+type.
 * Uses persisted notifications as source of truth (survives restarts).
 */
function alreadyNotifiedToday(userId: string, todoId: string, type: string, todayStr: string): boolean {
  const notifs = listNotifications(userId);
  return notifs.some((n) =>
    n.type === type &&
    n.data?.todoId === todoId &&
    n.createdAt.startsWith(todayStr),
  );
}

/**
 * Scans all active todos for upcoming deadlines and creates
 * in-app notifications. Runs once per hour.
 */
function checkDeadlines(): void {
  const store = getStore();
  const todoStore = store.todos ?? {};
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const todayStr = now.toISOString().split("T")[0];

  for (const [userId, todos] of Object.entries(todoStore)) {
    const userTodos = todos as Record<string, Record<string, unknown>>;
    for (const todo of Object.values(userTodos)) {
      if (todo.status !== "active") continue;
      if (!todo.deadline) continue;

      const deadlineDate = new Date(todo.deadline as string);
      if (isNaN(deadlineDate.getTime())) continue;

      const deadlineStr = deadlineDate.toISOString().split("T")[0];
      const title = todo.title as string;
      const todoId = todo.id as string;

      if (deadlineStr === todayStr) {
        if (alreadyNotifiedToday(userId, todoId, "deadline_today", todayStr)) continue;
        createNotification(
          userId,
          "deadline_today",
          "Échéance aujourd'hui",
          `La tâche "${title}" arrive à échéance aujourd'hui`,
          { todoId },
        );
      } else if (deadlineDate > now && deadlineDate <= in24h) {
        if (alreadyNotifiedToday(userId, todoId, "deadline_approaching", todayStr)) continue;
        createNotification(
          userId,
          "deadline_approaching",
          "Échéance proche",
          `La tâche "${title}" arrive à échéance demain`,
          { todoId },
        );
      }
    }
  }
}

let reminderTimer: ReturnType<typeof setInterval> | null = null;

export function startReminderJob(): void {
  console.log("[reminders] Démarrage du job de rappels (intervalle: 1h)");
  checkDeadlines();
  reminderTimer = setInterval(checkDeadlines, REMINDER_INTERVAL_MS);
  reminderTimer.unref();
}

export function stopReminderJob(): void {
  if (reminderTimer) { clearInterval(reminderTimer); reminderTimer = null; }
}
