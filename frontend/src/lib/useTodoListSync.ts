"use client";

import { useResourceSync, type UseResourceSyncOptions } from "./useResourceSync";

/**
 * Refetch todo lists when the tab becomes visible again, when the network
 * comes back online, and when another tab broadcasts a todos mutation.
 *
 * Delegates to the unified `useResourceSync("todos", onRefresh)` helper so
 * all resource domains use the same visibility + BroadcastChannel pattern.
 */
export function useTodoListSync(onRefresh: () => void, options?: UseResourceSyncOptions): void {
  useResourceSync("todos", onRefresh, options);
}
