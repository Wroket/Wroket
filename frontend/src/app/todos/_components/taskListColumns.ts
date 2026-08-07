/**
 * Movable TaskList columns (drag handle + select stay fixed).
 * Keep in sync with backend sanitizeTaskListColumnOrder.
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

export const DEFAULT_TASK_LIST_COLUMNS: TaskListColumnId[] = [...TASK_LIST_COLUMN_IDS];

/** Uniform badge width for Priority / Deadline / Effort / Focus cells (legacy UI). */
export const TASK_LIST_META_TAG =
  "inline-flex w-full items-center justify-center text-center text-xs font-semibold px-1.5 py-0.5 rounded truncate";

/**
 * V2: size to label (no w-full/truncate) so meta columns stay readable when
 * Intitulé absorbs leftover width under table-layout:fixed.
 */
export const TASK_LIST_META_TAG_V2 =
  "inline-flex shrink-0 items-center justify-center text-center text-xs font-semibold px-1.5 py-0.5 rounded whitespace-nowrap";

export function taskListMetaTag(uiV2: boolean): string {
  return uiV2 ? TASK_LIST_META_TAG_V2 : TASK_LIST_META_TAG;
}

const ALLOWED = new Set<string>(TASK_LIST_COLUMN_IDS);

/**
 * Normalize a stored / API column order: drop unknowns, dedupe, append missing defaults.
 */
export function sanitizeColumnOrder(raw: unknown): TaskListColumnId[] {
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
