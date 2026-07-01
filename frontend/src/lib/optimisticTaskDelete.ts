import type { Todo } from "@/lib/api";

export type TaskDeleteMode = "promote" | "deleteAll";

/** Soft-delete marker for optimistic UI (matches server-side delete). */
export function markTodoDeleted(todo: Todo): Todo {
  const now = new Date().toISOString();
  return { ...todo, status: "deleted", statusChangedAt: now, updatedAt: now };
}

export function affectedIdsForDelete(
  todo: Todo,
  subs: Todo[],
  mode: TaskDeleteMode,
): Set<string> {
  const ids = new Set<string>([todo.id]);
  if (mode === "deleteAll") {
    for (const sub of subs) ids.add(sub.id);
  }
  return ids;
}

export function snapshotAffectedTodos(list: Todo[], ids: Set<string>): Todo[] {
  return list.filter((t) => ids.has(t.id)).map((t) => ({ ...t }));
}

export function restoreTodosInList(list: Todo[], snapshot: Todo[]): Todo[] {
  if (snapshot.length === 0) return list;
  const snapById = new Map(snapshot.map((t) => [t.id, t]));
  const merged = list.map((t) => snapById.get(t.id) ?? t);
  for (const s of snapshot) {
    if (!merged.some((t) => t.id === s.id)) merged.push(s);
  }
  return merged;
}

export function applyOptimisticDeleteToList(
  list: Todo[],
  todo: Todo,
  subs: Todo[],
  mode: TaskDeleteMode,
): Todo[] {
  let next = [...list];
  for (const sub of subs) {
    const idx = next.findIndex((t) => t.id === sub.id);
    if (idx === -1) continue;
    if (mode === "promote") {
      next[idx] = { ...next[idx], parentId: null };
    } else {
      next[idx] = markTodoDeleted(next[idx]);
    }
  }
  const mainIdx = next.findIndex((t) => t.id === todo.id);
  if (mainIdx !== -1) {
    next[mainIdx] = markTodoDeleted(next[mainIdx]);
  }
  return next;
}

export interface OptimisticDeleteToast {
  info: (message: string) => void;
  error: (message: string) => void;
}

/**
 * Applies optimistic UI, shows a non-blocking toast, runs the server delete, rolls back on failure.
 */
export async function runOptimisticTaskDelete(opts: {
  applyOptimistic: () => void;
  rollback: () => void;
  deleteOnServer: () => Promise<void>;
  toast: OptimisticDeleteToast;
  inProgressMessage: string;
  errorMessage: string;
}): Promise<boolean> {
  opts.applyOptimistic();
  opts.toast.info(opts.inProgressMessage);
  try {
    await opts.deleteOnServer();
    return true;
  } catch {
    opts.rollback();
    opts.toast.error(opts.errorMessage);
    return false;
  }
}
