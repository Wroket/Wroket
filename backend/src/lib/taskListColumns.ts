/**
 * Movable TaskList columns — keep in sync with frontend taskListColumns.ts.
 */
export const TASK_LIST_COLUMN_IDS = [
  "actions",
  "title",
  "priority",
  "effort",
  "deadline",
  "classification",
] as const;

export type TaskListColumnId = (typeof TASK_LIST_COLUMN_IDS)[number];

const ALLOWED = new Set<string>(TASK_LIST_COLUMN_IDS);

/**
 * Normalize a stored / API column order: drop unknowns, dedupe, append missing defaults.
 */
export function sanitizeTaskListColumnOrder(raw: unknown): TaskListColumnId[] {
  const seen = new Set<string>();
  const out: TaskListColumnId[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item !== "string" || !ALLOWED.has(item) || seen.has(item)) continue;
      seen.add(item);
      out.push(item as TaskListColumnId);
    }
  }
  for (const id of TASK_LIST_COLUMN_IDS) {
    if (!seen.has(id)) out.push(id);
  }
  return out;
}
