/**
 * Create tasks from a note the user can edit.
 * Does not change `note.todoId` (that field stays the 1:1 task note).
 */
import { addPhase, canEditProjectContent, getProjectById } from "./projectService";
import { resolveNoteAccess } from "./noteService";
import { assertDependenciesEntitlement } from "./todoDependencyService";
import { createTodo, listTodos, updateTodo, type Priority, type Todo } from "./todoService";
import { AppError, NotFoundError, ValidationError } from "../utils/errors";

const MAX_ITEMS = 25;
const PRIORITIES = new Set<Priority>(["low", "medium", "high"]);

export interface SpawnTaskItem {
  clientKey: string;
  title: string;
  deadline?: string | null;
  priority?: Priority;
  column?: string | null;
  assignedTo?: string | null;
}

export interface SpawnTaskEdge {
  from: string;
  to: string;
}

export interface SpawnTasksInput {
  projectId?: string | null;
  phaseId?: string | null;
  parentId?: string | null;
  createPhases?: boolean;
  items: SpawnTaskItem[];
  edges?: SpawnTaskEdge[];
}

export interface SpawnTasksResult {
  created: Array<{ clientKey: string; id: string; title: string; alreadyExisted: boolean }>;
  failed: Array<{ clientKey: string; message: string; code?: string }>;
  dependenciesApplied: boolean;
  dependencySkipped?: string;
  phasesCreated: string[];
}

function deadlineOrNull(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  const value = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T12:00:00`;
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) throw new ValidationError("Date invalide");
  return value;
}

function normalizeItems(raw: unknown): SpawnTaskItem[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ValidationError("Aucune tâche à créer", "SPAWN_EMPTY");
  }
  if (raw.length > MAX_ITEMS) {
    throw new ValidationError(`Maximum ${MAX_ITEMS} tâches à la fois`, "SPAWN_TOO_MANY");
  }
  const items: SpawnTaskItem[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (!row || typeof row !== "object") throw new ValidationError("Ligne de tâche invalide");
    const item = row as Record<string, unknown>;
    const clientKey = typeof item.clientKey === "string" ? item.clientKey.trim().slice(0, 80) : "";
    const title = typeof item.title === "string" ? item.title.trim().slice(0, 500) : "";
    if (!clientKey || !title) throw new ValidationError("Chaque tâche a besoin d'une clé et d'un titre");
    if (seen.has(clientKey)) throw new ValidationError("Clé de tâche en double");
    seen.add(clientKey);
    const priority = PRIORITIES.has(item.priority as Priority) ? (item.priority as Priority) : "medium";
    const column = typeof item.column === "string" ? item.column.trim().slice(0, 80) : "";
    const deadline = item.deadline == null ? null : String(item.deadline);
    const assignedTo = typeof item.assignedTo === "string" ? item.assignedTo.trim().slice(0, 200) : "";
    items.push({ clientKey, title, priority, deadline, column: column || null, assignedTo: assignedTo || null });
  }
  return items;
}

function normalizeEdges(raw: unknown, keys: Set<string>): SpawnTaskEdge[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new ValidationError("Arêtes invalides");
  const edges: SpawnTaskEdge[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const edge = row as Record<string, unknown>;
    const from = typeof edge.from === "string" ? edge.from.trim() : "";
    const to = typeof edge.to === "string" ? edge.to.trim() : "";
    if (!from || !to || from === to || !keys.has(from) || !keys.has(to)) continue;
    edges.push({ from, to });
  }
  return edges;
}

/**
 * Create the checked lines as tasks owned by the caller.
 * An existing task with the same note + node key is returned instead of duplicated.
 */
export async function spawnTasksFromNote(
  uid: string,
  email: string,
  noteId: string,
  body: unknown,
): Promise<SpawnTasksResult> {
  const access = resolveNoteAccess(uid, email, noteId);
  if (!access?.canWrite) throw new NotFoundError("Note introuvable");

  const input = (body ?? {}) as Record<string, unknown>;
  const items = normalizeItems(input.items);
  const keys = new Set(items.map((item) => item.clientKey));
  const edges = normalizeEdges(input.edges, keys);
  const projectId = typeof input.projectId === "string" && input.projectId.trim() ? input.projectId.trim() : null;
  const phaseId = typeof input.phaseId === "string" && input.phaseId.trim() ? input.phaseId.trim() : null;
  const parentId = typeof input.parentId === "string" && input.parentId.trim() ? input.parentId.trim() : null;
  const createPhases = input.createPhases === true;

  const columnPhase = new Map<string, string>();
  const phasesCreated: string[] = [];
  if (createPhases && projectId) {
    const project = getProjectById(projectId);
    if (!project || !canEditProjectContent(uid, email.trim().toLowerCase(), project)) {
      throw new ValidationError("Projet introuvable ou non modifiable");
    }
    const columns = [...new Set(items.map((item) => item.column?.trim()).filter((name): name is string => !!name))];
    for (const name of columns) {
      const existing = project.phases.find((phase) => phase.name.trim().toLowerCase() === name.toLowerCase());
      if (existing) {
        columnPhase.set(name, existing.id);
        continue;
      }
      const created = addPhase(projectId, { name });
      columnPhase.set(name, created.id);
      phasesCreated.push(created.id);
    }
  }

  const existing = (await listTodos(uid)).filter(
    (todo) => todo.originNoteId === noteId && todo.status !== "deleted" && todo.originNodeId,
  );
  const created: SpawnTasksResult["created"] = [];
  const failed: SpawnTasksResult["failed"] = [];
  const keyToId = new Map<string, string>();

  for (const item of items) {
    const previous = existing.find((todo) => todo.originNodeId === item.clientKey);
    if (previous) {
      keyToId.set(item.clientKey, previous.id);
      created.push({ clientKey: item.clientKey, id: previous.id, title: previous.title, alreadyExisted: true });
      continue;
    }
    try {
      const itemPhase = (item.column && columnPhase.get(item.column)) || phaseId;
      const todo = await createTodo(uid, email, {
        title: item.title,
        priority: item.priority ?? "medium",
        effort: "medium",
        deadline: deadlineOrNull(item.deadline),
        projectId: parentId ? undefined : projectId,
        phaseId: parentId ? undefined : itemPhase,
        parentId,
        assignedTo: item.assignedTo,
        originNoteId: noteId,
        originNodeId: item.clientKey,
      });
      keyToId.set(item.clientKey, todo.id);
      created.push({ clientKey: item.clientKey, id: todo.id, title: todo.title, alreadyExisted: false });
    } catch (err) {
      const appErr = err instanceof AppError ? err : null;
      failed.push({
        clientKey: item.clientKey,
        message: err instanceof Error ? err.message : "Création impossible",
        code: appErr?.code,
      });
    }
  }

  let dependenciesApplied = false;
  let dependencySkipped: string | undefined;
  if (edges.length > 0 && !projectId && !parentId) {
    dependencySkipped = "DEPENDENCY_PROJECT_REQUIRED";
  } else if (edges.length > 0) {
    try {
      assertDependenciesEntitlement(uid);
      const byTarget = new Map<string, string[]>();
      for (const edge of edges) {
        const targetId = keyToId.get(edge.to);
        const blockerId = keyToId.get(edge.from);
        if (!targetId || !blockerId) continue;
        const list = byTarget.get(targetId) ?? [];
        list.push(blockerId);
        byTarget.set(targetId, list);
      }
      let applied = 0;
      for (const [targetId, blockerIds] of byTarget) {
        const current = existing.find((todo) => todo.id === targetId);
        const merged = [...new Set([...(current?.blockedByTodoIds ?? []), ...blockerIds])];
        try {
          await updateTodo(uid, email, targetId, { blockedByTodoIds: merged });
          applied += 1;
        } catch (err) {
          if (err instanceof AppError && err.code) dependencySkipped = err.code;
          else throw err;
        }
      }
      dependenciesApplied = applied > 0;
    } catch (err) {
      if (err instanceof AppError && err.code) dependencySkipped = err.code;
      else throw err;
    }
  }

  return { created, failed, dependenciesApplied, dependencySkipped, phasesCreated };
}

/** Tasks the caller created from this note. */
export async function listSpawnedTasks(uid: string, email: string, noteId: string): Promise<Todo[]> {
  const access = resolveNoteAccess(uid, email, noteId);
  if (!access) throw new NotFoundError("Note introuvable");
  const todos = await listTodos(uid);
  return todos.filter((todo) => todo.originNoteId === noteId && todo.status !== "deleted");
}
