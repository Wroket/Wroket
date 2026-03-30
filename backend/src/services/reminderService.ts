import { getStore } from "../persistence";
import { createNotification } from "./notificationService";

const REMINDER_INTERVAL_MS = 60 * 60 * 1000; // 1h
const notifiedSet = new Set<string>();

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
        const key = `today:${todoId}:${todayStr}`;
        if (notifiedSet.has(key)) continue;
        notifiedSet.add(key);

        createNotification(
          userId,
          "deadline_today",
          "Échéance aujourd'hui",
          `La tâche "${title}" arrive à échéance aujourd'hui`,
          { todoId },
        );
      } else if (deadlineDate > now && deadlineDate <= in24h) {
        const key = `24h:${todoId}:${todayStr}`;
        if (notifiedSet.has(key)) continue;
        notifiedSet.add(key);

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

export function startReminderJob(): void {
  console.log("[reminders] Démarrage du job de rappels (intervalle: 1h)");
  checkDeadlines();
  setInterval(checkDeadlines, REMINDER_INTERVAL_MS);
}
