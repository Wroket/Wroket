import crypto from "crypto";

import { loadStore, saveStore } from "../persistence";

export type Priority = "low" | "medium" | "high";
export type Effort = "light" | "medium" | "heavy";
export type TodoStatus = "active" | "completed" | "cancelled" | "deleted";
export type AssignmentStatus = "pending" | "accepted" | "declined";

export interface Todo {
  id: string;
  userId: string;
  parentId: string | null;
  assignedTo: string | null;
  assignmentStatus: AssignmentStatus | null;
  title: string;
  priority: Priority;
  effort: Effort;
  deadline: string | null;
  status: TodoStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTodoInput {
  title: string;
  priority: Priority;
  effort?: Effort;
  deadline?: string | null;
  parentId?: string | null;
  assignedTo?: string | null;
}

export interface UpdateTodoInput {
  title?: string;
  priority?: Priority;
  effort?: Effort;
  deadline?: string | null;
  status?: TodoStatus;
  assignedTo?: string | null;
  assignmentStatus?: AssignmentStatus | null;
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
  const store = loadStore();
  store.todos = obj;
  saveStore(store);
}

(function hydrateTodos() {
  const store = loadStore();
  if (store.todos) {
    let count = 0;
    for (const [userId, todos] of Object.entries(store.todos)) {
      const map = new Map<string, Todo>();
      for (const [id, todo] of Object.entries(todos as Record<string, Todo>)) {
        if (todo.assignmentStatus === undefined) {
          todo.assignmentStatus = todo.assignedTo ? "pending" : null;
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

export function listTodos(userId: string): Todo[] {
  const todos = getUserTodos(userId);
  return Array.from(todos.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Returns all tasks assigned to `userId` by other users.
 */
export function listAssignedToMe(userId: string): Todo[] {
  const result: Todo[] = [];
  todosByUser.forEach((todos, ownerUid) => {
    if (ownerUid === userId) return;
    todos.forEach((todo) => {
      if (todo.assignedTo === userId) result.push(todo);
    });
  });
  return result.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function createTodo(userId: string, input: CreateTodoInput): Todo {
  if (!input.title || input.title.trim().length === 0) {
    throw new Error("Le titre est requis");
  }
  if (input.title.trim().length > 500) {
    throw new Error("Le titre ne doit pas dépasser 500 caractères");
  }
  if (!VALID_PRIORITIES.includes(input.priority)) {
    throw new Error("Priorité invalide (low, medium, high)");
  }
  if (input.effort && !VALID_EFFORTS.includes(input.effort)) {
    throw new Error("Charge invalide (light, medium, heavy)");
  }
  if (input.deadline) {
    const d = new Date(input.deadline);
    if (isNaN(d.getTime())) throw new Error("Date deadline invalide");
  }

  if (input.parentId) {
    const parentTodo = getUserTodos(userId).get(input.parentId);
    if (!parentTodo) throw new Error("Tâche parente introuvable");
    if (parentTodo.parentId) throw new Error("Une sous-tâche ne peut pas avoir de sous-tâche");
    if (input.deadline && parentTodo.deadline) {
      if (new Date(input.deadline) > new Date(parentTodo.deadline)) {
        throw new Error("La deadline d'une sous-tâche ne peut pas dépasser celle de la tâche parente");
      }
    }
  }

  const now = new Date().toISOString();
  const todo: Todo = {
    id: crypto.randomUUID(),
    userId,
    parentId: input.parentId ?? null,
    assignedTo: input.assignedTo ?? null,
    assignmentStatus: input.assignedTo ? "pending" : null,
    title: input.title.trim(),
    priority: input.priority,
    effort: input.effort ?? "medium",
    deadline: input.deadline ?? null,
    status: "active",
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
  if (!found) throw new Error("Tâche introuvable");
  const { todo, ownerMap: todos } = found;

  if (input.title !== undefined) {
    if (input.title.trim().length === 0) throw new Error("Le titre est requis");
    todo.title = input.title.trim();
  }
  if (input.priority !== undefined) {
    if (!VALID_PRIORITIES.includes(input.priority)) {
      throw new Error("Priorité invalide (low, medium, high)");
    }
    todo.priority = input.priority;
  }
  if (input.effort !== undefined) {
    if (!VALID_EFFORTS.includes(input.effort)) {
      throw new Error("Charge invalide (light, medium, heavy)");
    }
    todo.effort = input.effort;
  }
  if (input.deadline !== undefined) {
    if (input.deadline !== null) {
      const d = new Date(input.deadline);
      if (isNaN(d.getTime())) throw new Error("Date deadline invalide");
    }
    todo.deadline = input.deadline;
  }
  if (input.status !== undefined) {
    if (!VALID_STATUSES.includes(input.status)) {
      throw new Error("Statut invalide (active, completed, cancelled)");
    }
    todo.status = input.status;
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

  todo.updatedAt = new Date().toISOString();
  todos.set(todoId, todo);
  persistTodos();
  return todo;
}

export function deleteTodo(userId: string, todoId: string): Todo {
  const found = findTodoForUser(userId, todoId);
  if (!found) throw new Error("Tâche introuvable");
  const { todo, ownerMap: todos } = found;
  todo.status = "deleted";
  todo.updatedAt = new Date().toISOString();
  todos.set(todoId, todo);
  persistTodos();
  return todo;
}
