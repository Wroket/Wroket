import { broadcastResourceChange } from "./useResourceSync";

/**
 * Notify other browser tabs that todo data changed so they can refetch.
 * Safe to call after successful create/update/delete/reorder API calls.
 */
export function broadcastTodosMutated(): void {
  broadcastResourceChange("todos");
}

// Keep legacy export so existing imports resolve without changes.
export const TODO_SYNC_BROADCAST_CHANNEL = "wroket-todos-sync";

/** @deprecated Use broadcastResourceChange("todos") directly. */
export function getTabId(): string {
  if (typeof window === "undefined") return "";
  const w = window as Window & { __wroketTabId?: string };
  return w.__wroketTabId ?? "";
}
