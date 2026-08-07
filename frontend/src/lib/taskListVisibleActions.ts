/**
 * V2 TaskList — which row action icons are pinned in the Actions column.
 * localStorage only (not synced to profile).
 */

export const TASK_LIST_VISIBLE_ACTIONS_KEY = "wroket-ui-v2-task-actions";

export const TASK_LIST_ACTION_IDS = [
  "schedule",
  "meet",
  "comment",
  "note",
  "subtask",
  "attach",
  "cancel",
  "delete",
] as const;

export type TaskListActionId = (typeof TASK_LIST_ACTION_IDS)[number];

/** Default pins — matches the previous V2 toolbar. */
export const DEFAULT_VISIBLE_ACTIONS: TaskListActionId[] = [
  "schedule",
  "meet",
  "comment",
];

const ALLOWED = new Set<string>(TASK_LIST_ACTION_IDS);

/**
 * Keep known ids, drop unknowns/dupes, preserve canonical display order.
 */
export function sanitizeVisibleActions(raw: unknown): TaskListActionId[] {
  const selected = new Set<string>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string" && ALLOWED.has(item)) selected.add(item);
    }
  }
  return TASK_LIST_ACTION_IDS.filter((id) => selected.has(id));
}

export function readVisibleActions(): TaskListActionId[] {
  if (typeof window === "undefined") return [...DEFAULT_VISIBLE_ACTIONS];
  try {
    const raw = localStorage.getItem(TASK_LIST_VISIBLE_ACTIONS_KEY);
    if (!raw) return [...DEFAULT_VISIBLE_ACTIONS];
    return sanitizeVisibleActions(JSON.parse(raw) as unknown);
  } catch {
    return [...DEFAULT_VISIBLE_ACTIONS];
  }
}

export function writeVisibleActions(ids: TaskListActionId[]): void {
  try {
    localStorage.setItem(
      TASK_LIST_VISIBLE_ACTIONS_KEY,
      JSON.stringify(sanitizeVisibleActions(ids)),
    );
  } catch {
    /* private mode */
  }
}

export function isActionVisible(
  visible: readonly TaskListActionId[],
  id: TaskListActionId,
): boolean {
  return visible.includes(id);
}
