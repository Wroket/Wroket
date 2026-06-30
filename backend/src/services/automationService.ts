import { getStore } from "../persistence";
import { listNotifications, createNotification } from "./notificationService";
import { listProjects } from "./projectService";
import { listAllTodos } from "./todoService";
import type { Todo } from "./todoService";

export interface AutomationRules {
  notifyAssigneeOverdue: boolean;
  notifyProjectOwnerOverdue: boolean;
}

const DEFAULT_RULES: AutomationRules = {
  notifyAssigneeOverdue: false,
  notifyProjectOwnerOverdue: false,
};

function parseDeadlineDay(deadline: string): Date {
  const d = new Date(deadline);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getEffectiveDueDay(todo: Todo): Date | null {
  const days: Date[] = [];
  if (todo.deadline?.trim()) {
    const d = parseDeadlineDay(todo.deadline.trim());
    if (!Number.isNaN(d.getTime())) days.push(d);
  }
  if (todo.scheduledSlot?.start) {
    const d = new Date(todo.scheduledSlot.start);
    if (!Number.isNaN(d.getTime())) {
      d.setHours(0, 0, 0, 0);
      days.push(d);
    }
  }
  if (days.length === 0) return null;
  return days.reduce((a, b) => (a.getTime() <= b.getTime() ? a : b));
}

function isEffectivelyOverdue(todo: Todo, now: Date): boolean {
  const due = getEffectiveDueDay(todo);
  if (!due) return false;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return due.getTime() < today.getTime();
}

export function getAutomationRulesForUid(uid: string): AutomationRules {
  const store = getStore();
  const users = store.users as Record<string, Record<string, unknown>> | undefined;
  const row = users?.[uid];
  if (!row) return { ...DEFAULT_RULES };
  return {
    notifyAssigneeOverdue: row.automationNotifyAssigneeOverdue === true,
    notifyProjectOwnerOverdue: row.automationNotifyProjectOwnerOverdue === true,
  };
}

function wasAutomationSentToday(userId: string, automationKey: string, todayStr: string): boolean {
  return listNotifications(userId).some(
    (n) => n.createdAt.startsWith(todayStr) && n.data?.automationKey === automationKey,
  );
}

async function allTodosFlat(): Promise<Todo[]> {
  const store = getStore();
  const todoStore = store.todos ?? {};
  const out: Todo[] = [];
  for (const userId of Object.keys(todoStore)) {
    out.push(...(await listAllTodos(userId)));
  }
  const seen = new Set<string>();
  return out.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}

/**
 * Hourly automation pass for opt-in rules (deduped once per day per todo).
 */
export async function runAutomationChecks(now: Date = new Date()): Promise<void> {
  const store = getStore();
  const users = store.users as Record<string, Record<string, unknown>> | undefined;
  if (!users) return;

  const todayStr = now.toISOString().split("T")[0];
  const allTodos = (await allTodosFlat()).filter((t) => t.status === "active" && isEffectivelyOverdue(t, now));

  for (const uid of Object.keys(users)) {
    const rules = getAutomationRulesForUid(uid);
    if (!rules.notifyAssigneeOverdue && !rules.notifyProjectOwnerOverdue) continue;

    const email = typeof users[uid]?.email === "string" ? users[uid].email as string : "";

    if (rules.notifyAssigneeOverdue) {
      for (const todo of allTodos.filter((t) => t.assignedTo === uid)) {
        const key = `automation_overdue_assignee:${todo.id}`;
        if (wasAutomationSentToday(uid, key, todayStr)) continue;
        createNotification(
          uid,
          "deadline_today",
          "Tâche en retard",
          `La tâche "${todo.title}" qui vous est assignée est en retard.`,
          { todoId: todo.id, todoTitle: todo.title, automationKey: key },
        );
      }
    }

    if (rules.notifyProjectOwnerOverdue && email) {
      const ownedProjectIds = new Set(
        listProjects(uid, email).filter((p) => p.ownerUid === uid && p.status === "active").map((p) => p.id),
      );
      for (const todo of allTodos.filter((t) => t.projectId && ownedProjectIds.has(t.projectId))) {
        const key = `automation_overdue_owner:${todo.id}`;
        if (wasAutomationSentToday(uid, key, todayStr)) continue;
        createNotification(
          uid,
          "deadline_today",
          "Retard sur votre projet",
          `La tâche "${todo.title}" est en retard dans un de vos projets.`,
          { todoId: todo.id, todoTitle: todo.title, projectId: todo.projectId!, automationKey: key },
        );
      }
    }
  }
}
