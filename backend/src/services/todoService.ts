import crypto from "crypto";

import { getStore, scheduleSave } from "../persistence";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";

export type Priority = "low" | "medium" | "high";
export type Effort = "light" | "medium" | "heavy";
export type TodoStatus = "active" | "completed" | "cancelled" | "deleted";
export type AssignmentStatus = "pending" | "accepted" | "declined";

export interface ScheduledSlot {
  start: string; // ISO datetime
  end: string;   // ISO datetime
  calendarEventId: string | null;
}

export type RecurrenceFrequency = "daily" | "weekly" | "monthly";

export interface Recurrence {
  frequency: RecurrenceFrequency;
  interval: number;
  nextDueDate?: string;
  endDate?: string;
}

export interface Todo {
  id: string;
  userId: string;
  parentId: string | null;
  projectId: string | null;
  phaseId: string | null;
  assignedTo: string | null;
  assignmentStatus: AssignmentStatus | null;
  title: string;
  priority: Priority;
  effort: Effort;
  estimatedMinutes: number | null;
  startDate: string | null;
  deadline: string | null;
  tags: string[];
  status: TodoStatus;
  scheduledSlot: ScheduledSlot | null;
  recurrence: Recurrence | null;
  sortOrder: number | null;
  statusChangedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTodoInput {
  title: string;
  priority: Priority;
  effort?: Effort;
  estimatedMinutes?: number | null;
  startDate?: string | null;
  deadline?: string | null;
  tags?: string[];
  parentId?: string | null;
  projectId?: string | null;
  phaseId?: string | null;
  assignedTo?: string | null;
  recurrence?: Recurrence | null;
  sortOrder?: number | null;
}

export interface UpdateTodoInput {
  title?: string;
  priority?: Priority;
  effort?: Effort;
  estimatedMinutes?: number | null;
  startDate?: string | null;
  deadline?: string | null;
  tags?: string[];
  status?: TodoStatus;
  projectId?: string | null;
  phaseId?: string | null;
  assignedTo?: string | null;
  assignmentStatus?: AssignmentStatus | null;
  scheduledSlot?: ScheduledSlot | null;
  recurrence?: Recurrence | null;
  sortOrder?: number | null;
}

const VALID_PRIORITIES: Priority[] = ["low", "medium", "high"];
const VALID_EFFORTS: Effort[] = ["light", "medium", "heavy"];
const VALID_STATUSES: TodoStatus[] = ["active", "completed", "cancelled", "deleted"];
const VALID_FREQUENCIES: RecurrenceFrequency[] = ["daily", "weekly", "monthly"];

function validateRecurrence(rec: Recurrence): void {
  if (!VALID_FREQUENCIES.includes(rec.frequency)) {
    throw new ValidationError("Fréquence invalide (daily, weekly, monthly)");
  }
  if (!Number.isFinite(rec.interval) || !Number.isInteger(rec.interval) || rec.interval < 1 || rec.interval > 365) {
    throw new ValidationError("Intervalle invalide (entier entre 1 et 365)");
  }
  if (rec.endDate) {
    const d = new Date(rec.endDate);
    if (isNaN(d.getTime())) throw new ValidationError("Date de fin de récurrence invalide");
  }
}

function calculateNextDueDate(
  currentDeadline: string,
  frequency: RecurrenceFrequency,
  interval: number,
): string {
  const date = new Date(currentDeadline);
  if (isNaN(date.getTime())) throw new ValidationError("Date de référence invalide pour récurrence");
  switch (frequency) {
    case "daily":
      date.setDate(date.getDate() + interval);
      break;
    case "weekly":
      date.setDate(date.getDate() + 7 * interval);
      break;
    case "monthly":
      date.setMonth(date.getMonth() + interval);
      break;
  }
  return date.toISOString().split("T")[0];
}

const todosByUser = new Map<string, Map<string, Todo>>();

function persistTodos(): void {
  const obj: Record<string, Record<string, Todo>> = {};
  todosByUser.forEach((todos, userId) => {
    obj[userId] = {};
    todos.forEach((todo, id) => { obj[userId][id] = todo; });
  });
  const store = getStore();
  store.todos = obj;
  scheduleSave("todos");
}

(function hydrateTodos() {
  const store = getStore();
  if (store.todos) {
    let count = 0;
    for (const [userId, todos] of Object.entries(store.todos)) {
      const map = new Map<string, Todo>();
      for (const [id, todo] of Object.entries(todos as Record<string, Todo>)) {
        if (todo.assignmentStatus === undefined) {
          todo.assignmentStatus = todo.assignedTo ? "pending" : null;
        }
        if (todo.projectId === undefined) {
          todo.projectId = null;
        }
        if (todo.phaseId === undefined) {
          todo.phaseId = null;
        }
        if (todo.startDate === undefined) {
          todo.startDate = null;
        }
        if (!todo.effort) {
          todo.effort = "medium";
        }
        if ((todo as unknown as Record<string, unknown>).estimatedMinutes === undefined) {
          todo.estimatedMinutes = null;
        }
        if (!Array.isArray(todo.tags)) {
          todo.tags = [];
        }
        if ((todo as unknown as Record<string, unknown>).scheduledSlot === undefined) {
          todo.scheduledSlot = null;
        }
        if ((todo as unknown as Record<string, unknown>).recurrence === undefined) {
          todo.recurrence = null;
        }
        if ((todo as unknown as Record<string, unknown>).sortOrder === undefined) {
          todo.sortOrder = null;
        }
        if (!todo.statusChangedAt) {
          todo.statusChangedAt = todo.status === "active" ? todo.createdAt : todo.updatedAt;
        }
        map.set(id, todo);
        count++;
      }
      todosByUser.set(userId, map);
    }
    console.log("[todos] %d tâche(s) chargée(s) depuis le fichier local", count);
  }
})();

function getUserTodos(userId: string): Map<string, Todo> {
  let todos = todosByUser.get(userId);
  if (!todos) {
    todos = new Map();
    todosByUser.set(userId, todos);
  }
  return todos;
}

const ARCHIVE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

export function isArchived(todo: Todo): boolean {
  if (todo.status === "active") return false;
  const elapsed = Date.now() - new Date(todo.statusChangedAt).getTime();
  return elapsed >= ARCHIVE_THRESHOLD_MS;
}

export function listArchivedTodos(userId: string): Todo[] {
  return listAllTodos(userId)
    .filter(isArchived)
    .sort((a, b) => new Date(b.statusChangedAt).getTime() - new Date(a.statusChangedAt).getTime());
}

export function listTodos(userId: string): Todo[] {
  const todos = getUserTodos(userId);
  return Array.from(todos.values())
    .filter((t) => !isArchived(t))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Returns all tasks (including archived) for internal use.
 */
export function listAllTodos(userId: string): Todo[] {
  return Array.from(getUserTodos(userId).values());
}

/**
 * Returns active (non-archived) todos for multiple user IDs.
 */
export function listTodosForUsers(userIds: string[]): Todo[] {
  const result: Todo[] = [];
  for (const uid of userIds) {
    const todos = getUserTodos(uid);
    for (const todo of todos.values()) {
      if (!isArchived(todo) && todo.status === "active") {
        result.push(todo);
      }
    }
  }
  return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Returns all tasks assigned to `userId` by other users.
 */
export function listAssignedToMe(userId: string): Todo[] {
  const result: Todo[] = [];
  todosByUser.forEach((todos, ownerUid) => {
    if (ownerUid === userId) return;
    todos.forEach((todo) => {
      if (todo.assignedTo === userId && !isArchived(todo)) result.push(todo);
    });
  });
  return result.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Check whether `userId` can access (read/comment on) a todo.
 *
 * WHY: The original code had no access check on the comment endpoints.
 * Any authenticated user could read or post comments on any task by
 * supplying an arbitrary todoId. This function is the single source of
 * truth for "can this user see this task?".
 *
 * A user can access a todo if:
 *   1. They own it, OR
 *   2. They are the assignee
 */
export function canAccessTodo(userId: string, todoId: string): boolean {
  return findTodoForUser(userId, todoId) !== null;
}

const MAX_REORDER_SIZE = 200;

/**
 * Updates sortOrder for a batch of owned todos in a single persist.
 * Returns the count of successfully updated items.
 */
export function batchReorder(userId: string, todoIds: string[]): number {
  const capped = todoIds.slice(0, MAX_REORDER_SIZE);
  let updated = 0;
  for (let i = 0; i < capped.length; i++) {
    const found = findTodoForUser(userId, capped[i]);
    if (found && found.isOwner) {
      found.todo.sortOrder = i;
      found.todo.updatedAt = new Date().toISOString();
      updated++;
    }
  }
  if (updated > 0) persistTodos();
  return updated;
}

export function createTodo(userId: string, input: CreateTodoInput): Todo {
  if (!input.title || input.title.trim().length === 0) {
    throw new ValidationError("Le titre est requis");
  }
  if (input.title.trim().length > 500) {
    throw new ValidationError("Le titre ne doit pas dépasser 500 caractères");
  }
  if (!VALID_PRIORITIES.includes(input.priority)) {
    throw new ValidationError("Priorité invalide (low, medium, high)");
  }
  if (input.effort && !VALID_EFFORTS.includes(input.effort)) {
    throw new ValidationError("Charge invalide (light, medium, heavy)");
  }
  if (input.deadline) {
    const d = new Date(input.deadline);
    if (isNaN(d.getTime())) throw new ValidationError("Date deadline invalide");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (d < today) throw new ValidationError("L'échéance ne peut pas être antérieure à aujourd'hui");
  }

  if (input.parentId) {
    const parentTodo = getUserTodos(userId).get(input.parentId);
    if (!parentTodo) throw new NotFoundError("Tâche parente introuvable");
    if (parentTodo.parentId) throw new ValidationError("Une sous-tâche ne peut pas avoir de sous-tâche");
    if (input.deadline && parentTodo.deadline) {
      if (new Date(input.deadline) > new Date(parentTodo.deadline)) {
        throw new ValidationError("La deadline d'une sous-tâche ne peut pas dépasser celle de la tâche parente");
      }
    }
  }

  if (input.recurrence) {
    validateRecurrence(input.recurrence);
  }

  const now = new Date().toISOString();
  const todo: Todo = {
    id: crypto.randomUUID(),
    userId,
    parentId: input.parentId ?? null,
    projectId: input.projectId ?? null,
    phaseId: input.phaseId ?? null,
    assignedTo: input.assignedTo ?? null,
    assignmentStatus: input.assignedTo ? "pending" : null,
    title: input.title.trim(),
    priority: input.priority,
    effort: input.effort ?? "medium",
    estimatedMinutes: input.estimatedMinutes ?? null,
    startDate: input.startDate ?? null,
    deadline: input.deadline ?? null,
    tags: (input.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 10),
    scheduledSlot: null,
    recurrence: input.recurrence ?? null,
    sortOrder: typeof input.sortOrder === "number" ? input.sortOrder : null,
    status: "active",
    statusChangedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  getUserTodos(userId).set(todo.id, todo);
  persistTodos();
  return todo;
}

/**
 * Finds a todo by id — first in the user's own map, then across
 * all users for tasks assigned to this user.
 */
function findTodoForUser(userId: string, todoId: string): { todo: Todo; ownerMap: Map<string, Todo>; isOwner: boolean } | null {
  const own = getUserTodos(userId);
  const ownTodo = own.get(todoId);
  if (ownTodo) return { todo: ownTodo, ownerMap: own, isOwner: true };

  for (const [, todos] of todosByUser) {
    const t = todos.get(todoId);
    if (t && t.assignedTo === userId) return { todo: t, ownerMap: todos, isOwner: false };
  }
  return null;
}

export function updateTodo(userId: string, todoId: string, input: UpdateTodoInput): Todo {
  const found = findTodoForUser(userId, todoId);
  if (!found) throw new NotFoundError("Tâche introuvable");
  const { todo, ownerMap: todos, isOwner } = found;

  // FIX: Only the task owner can change the assignee. Previously an
  // assignee could call updateTodo with { assignedTo: "someone_else" }
  // and steal/re-route the task away from the owner's control.
  if (input.assignedTo !== undefined && !isOwner) {
    throw new ForbiddenError("Seul le propriétaire de la tâche peut modifier l'assignation");
  }

  if (input.title !== undefined) {
    if (input.title.trim().length === 0) throw new ValidationError("Le titre est requis");
    todo.title = input.title.trim();
  }
  if (input.priority !== undefined) {
    if (!VALID_PRIORITIES.includes(input.priority)) {
      throw new ValidationError("Priorité invalide (low, medium, high)");
    }
    todo.priority = input.priority;
  }
  if (input.effort !== undefined) {
    if (!VALID_EFFORTS.includes(input.effort)) {
      throw new ValidationError("Charge invalide (light, medium, heavy)");
    }
    todo.effort = input.effort;
  }
  if (input.estimatedMinutes !== undefined) {
    todo.estimatedMinutes = input.estimatedMinutes;
  }
  if (input.deadline !== undefined) {
    if (input.deadline !== null) {
      const d = new Date(input.deadline);
      if (isNaN(d.getTime())) throw new ValidationError("Date deadline invalide");
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (d < today) throw new ValidationError("L'échéance ne peut pas être antérieure à aujourd'hui");
    }
    todo.deadline = input.deadline;
  }
  if (input.tags !== undefined) {
    todo.tags = input.tags.map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 10);
  }
  if (input.status !== undefined) {
    if (!VALID_STATUSES.includes(input.status)) {
      throw new ValidationError("Statut invalide (active, completed, cancelled, deleted)");
    }
    if (input.status !== todo.status) {
      todo.statusChangedAt = new Date().toISOString();
    }
    todo.status = input.status;
  }
  if (input.projectId !== undefined) {
    todo.projectId = input.projectId;
  }
  if (input.phaseId !== undefined) {
    todo.phaseId = input.phaseId;
  }
  if (input.startDate !== undefined) {
    if (input.startDate !== null) {
      const d = new Date(input.startDate);
      if (isNaN(d.getTime())) throw new ValidationError("Date de début invalide");
    }
    todo.startDate = input.startDate;
  }
  if (input.assignedTo !== undefined) {
    if (input.assignedTo !== todo.assignedTo) {
      todo.assignedTo = input.assignedTo;
      todo.assignmentStatus = input.assignedTo ? "pending" : null;
    }
  }
  if (input.assignmentStatus !== undefined) {
    todo.assignmentStatus = input.assignmentStatus;
  }
  if (input.scheduledSlot !== undefined) {
    todo.scheduledSlot = input.scheduledSlot;
  }
  if (input.recurrence !== undefined) {
    if (input.recurrence) {
      validateRecurrence(input.recurrence);
    }
    todo.recurrence = input.recurrence;
  }
  if (input.sortOrder !== undefined) {
    todo.sortOrder = input.sortOrder;
  }

  todo.updatedAt = new Date().toISOString();
  todos.set(todoId, todo);
  persistTodos();

  if (
    input.status === "completed" &&
    todo.recurrence &&
    todo.deadline
  ) {
    const { frequency, interval, endDate } = todo.recurrence;
    const nextDeadline = calculateNextDueDate(todo.deadline, frequency, interval);
    const pastEnd = endDate && nextDeadline > endDate;
    if (!pastEnd) {
      const ownerTodos = getUserTodos(todo.userId);
      const now2 = new Date().toISOString();
      const clone: Todo = {
        id: crypto.randomUUID(),
        userId: todo.userId,
        parentId: null,
        projectId: todo.projectId,
        phaseId: todo.phaseId,
        assignedTo: todo.assignedTo,
        assignmentStatus: todo.assignedTo ? "pending" : null,
        title: todo.title,
        priority: todo.priority,
        effort: todo.effort,
        estimatedMinutes: todo.estimatedMinutes,
        startDate: null,
        deadline: nextDeadline,
        tags: [...todo.tags],
        scheduledSlot: null,
        recurrence: {
          ...todo.recurrence,
          nextDueDate: calculateNextDueDate(nextDeadline, frequency, interval),
        },
        sortOrder: null,
        status: "active",
        statusChangedAt: now2,
        createdAt: now2,
        updatedAt: now2,
      };
      ownerTodos.set(clone.id, clone);
      persistTodos();
    }
  }

  return todo;
}

const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

setInterval(() => {
  let cleaned = 0;
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  todosByUser.forEach((todos) => {
    for (const [id, todo] of todos) {
      if (todo.status === "deleted" && new Date(todo.statusChangedAt).getTime() < cutoff) {
        todos.delete(id);
        cleaned++;
      }
    }
  });
  if (cleaned > 0) {
    persistTodos();
    console.log("[todos] %d tombstone(s) purgée(s) (> 30 jours)", cleaned);
  }
}, 6 * 60 * 60 * 1000).unref();

export function deleteTodo(userId: string, todoId: string): Todo {
  const found = findTodoForUser(userId, todoId);
  if (!found) throw new NotFoundError("Tâche introuvable");
  const { todo, ownerMap: todos } = found;
  const now = new Date().toISOString();
  todo.status = "deleted";
  todo.statusChangedAt = now;
  todo.updatedAt = now;
  todos.set(todoId, todo);
  persistTodos();
  return todo;
}
