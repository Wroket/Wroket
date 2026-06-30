import { getEntitlementsForUid } from "./authService";
import { findTodoForUser, listProjectTodos, type Todo, type TodoStatus } from "./todoService";
import { NotFoundError, PaymentRequiredError, UnprocessableEntityError, ValidationError } from "../utils/errors";

export const MAX_BLOCKERS_PER_TASK = 20;

export function assertDependenciesEntitlement(uid: string): void {
  if (!getEntitlementsForUid(uid).integrations) {
    throw new PaymentRequiredError(
      "Les dépendances entre tâches nécessitent le palier Small teams ou supérieur.",
      "DEPENDENCIES_PLAN_REQUIRED",
    );
  }
}

function isBlockerResolved(status: TodoStatus): boolean {
  return status === "completed" || status === "cancelled" || status === "deleted";
}

export function normalizeBlockedByTodoIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !item.trim()) continue;
    const id = item.trim();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_BLOCKERS_PER_TASK) break;
  }
  return out;
}

export function wouldCreateDependencyCycle(
  blockedByByTodoId: Map<string, string[]>,
  todoId: string,
  newBlockedBy: string[],
): boolean {
  const graph = new Map(blockedByByTodoId);
  graph.set(todoId, newBlockedBy);

  const visiting = new Set<string>();
  function visit(id: string): boolean {
    if (visiting.has(id)) return true;
    visiting.add(id);
    for (const dep of graph.get(id) ?? []) {
      if (visit(dep)) return true;
    }
    visiting.delete(id);
    return false;
  }
  return visit(todoId);
}

export async function validateBlockedByTodoIds(
  userId: string,
  todoId: string,
  projectId: string | null,
  blockedByTodoIds: string[],
): Promise<void> {
  if (blockedByTodoIds.length === 0) return;
  if (!projectId) {
    throw new ValidationError("Les dépendances ne sont disponibles que sur les tâches de projet", "DEPENDENCY_PROJECT_REQUIRED");
  }

  const unique = new Set(blockedByTodoIds);
  if (unique.size !== blockedByTodoIds.length) {
    throw new ValidationError("Doublon dans les dépendances", "DEPENDENCY_INVALID");
  }
  if (blockedByTodoIds.includes(todoId)) {
    throw new ValidationError("Une tâche ne peut pas dépendre d'elle-même", "DEPENDENCY_SELF");
  }

  const projectTodos = await listProjectTodos(projectId);
  const byId = new Map(projectTodos.map((t) => [t.id, t]));
  if (!byId.has(todoId)) {
    throw new NotFoundError("Tâche introuvable");
  }

  for (const blockerId of blockedByTodoIds) {
    const blocker = byId.get(blockerId);
    if (!blocker) {
      throw new ValidationError("Tâche bloquante introuvable dans ce projet", "DEPENDENCY_NOT_FOUND");
    }
    if (blocker.projectId !== projectId) {
      throw new ValidationError("Les dépendances doivent rester dans le même projet", "DEPENDENCY_CROSS_PROJECT");
    }
  }

  const blockedByMap = new Map<string, string[]>();
  for (const t of projectTodos) {
    blockedByMap.set(t.id, normalizeBlockedByTodoIds(t.blockedByTodoIds));
  }
  if (wouldCreateDependencyCycle(blockedByMap, todoId, blockedByTodoIds)) {
    throw new ValidationError("Cette dépendance créerait un cycle", "DEPENDENCY_CYCLE");
  }
}

export async function getActiveBlockersForTodo(todo: Todo): Promise<Array<{ id: string; title: string; status: TodoStatus }>> {
  const ids = normalizeBlockedByTodoIds(todo.blockedByTodoIds);
  if (ids.length === 0 || !todo.projectId) return [];

  const byId = new Map((await listProjectTodos(todo.projectId)).map((t) => [t.id, t]));
  const blockers: Array<{ id: string; title: string; status: TodoStatus }> = [];
  for (const id of ids) {
    const blocker = byId.get(id);
    if (!blocker || isBlockerResolved(blocker.status)) continue;
    blockers.push({ id: blocker.id, title: blocker.title, status: blocker.status });
  }
  return blockers;
}

export async function assertCanCompleteTodo(userId: string, todo: Todo): Promise<void> {
  const blockers = await getActiveBlockersForTodo(todo);
  if (blockers.length === 0) return;

  throw new UnprocessableEntityError(
    "Cette tâche est bloquée par d'autres tâches non terminées",
    "TASK_BLOCKED_BY_ACTIVE",
    { blockers },
  );
}

export async function findTodoBlockersForUser(
  userId: string,
  todoId: string,
): Promise<{ todo: Todo; blockers: Todo[] } | null> {
  const found = await findTodoForUser(userId, todoId);
  if (!found || !found.todo.projectId) return null;

  const ids = normalizeBlockedByTodoIds(found.todo.blockedByTodoIds);
  if (ids.length === 0) return { todo: found.todo, blockers: [] };

  const byId = new Map((await listProjectTodos(found.todo.projectId)).map((t) => [t.id, t]));
  const blockers = ids.map((id) => byId.get(id)).filter((t): t is Todo => !!t);
  return { todo: found.todo, blockers };
}
