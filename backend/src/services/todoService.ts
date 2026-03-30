import crypto from "crypto";

import { getStore, scheduleSave } from "../persistence";
import { NotFoundError, ValidationError } from "../utils/errors";

export type Priority = "low" | "medium" | "high";
export type Effort = "light" | "medium" | "heavy";
export type TodoStatus = "active" | "completed" | "cancelled" | "deleted";
export type AssignmentStatus = "pending" | "accepted" | "declined";

export interface ScheduledSlot {
  start: string; // ISO datetime
  end: string;   // ISO datetime
  calendarEventId: string | null;
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
  status: TodoStatus;
  scheduledSlot: ScheduledSlot | null;
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
  parentId?: string | null;
  projectId?: string | null;
  phaseId?: string | null;
  assignedTo?: string | null;
}

export interface UpdateTodoInput {
  title?: string;
  priority?: Priority;
  effort?: Effort;
  estimatedMinutes?: number | null;
  startDate?: string | null;
  deadline?: string | null;
  status?: TodoStatus;
  projectId?: string | null;
  phaseId?: string | null;
  assignedTo?: string | null;
  assignmentStatus?: AssignmentStatus | null;
  scheduledSlot?: ScheduledSlot | null;
}

const VALID_PRIORITIES: Priority[] = ["low", "medium", "high"];
const VALID_EFFORTS: Effort[] = ["light", "medium", "heavy"];
const VALID_STATUSES: TodoStatus[] = ["active", "completed", "cancelled", "deleted"];

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
        if ((todo as unknown as Record<string, unknown>).scheduledSlot === undefined) {
          todo.scheduledSlot = null;
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
    scheduledSlot: null,
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
function findTodoForUser(userId: string, todoId: string): { todo: Todo; ownerMap: Map<string, Todo> } | null {
  const own = getUserTodos(userId);
  const ownTodo = own.get(todoId);
  if (ownTodo) return { todo: ownTodo, ownerMap: own };

  for (const [, todos] of todosByUser) {
    const t = todos.get(todoId);
    if (t && t.assignedTo === userId) return { todo: t, ownerMap: todos };
  }
  return null;
}

export function updateTodo(userId: string, todoId: string, input: UpdateTodoInput): Todo {
  const found = findTodoForUser(userId, todoId);
  if (!found) throw new NotFoundError("Tâche introuvable");
  const { todo, ownerMap: todos } = found;

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

  todo.updatedAt = new Date().toISOString();
  todos.set(todoId, todo);
  persistTodos();
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
