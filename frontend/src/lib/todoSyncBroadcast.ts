const BROADCAST_CHANNEL = "wroket-todos-sync";

function getTabId(): string {
  if (typeof window === "undefined") return "";
  const w = window as Window & { __wroketTabId?: string };
  if (!w.__wroketTabId) {
    w.__wroketTabId = crypto.randomUUID();
  }
  return w.__wroketTabId;
}

/**
 * Notify other browser tabs that todo data changed so they can refetch.
 * Safe to call after successful create/update/delete/reorder API calls.
 */
export function broadcastTodosMutated(): void {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
  try {
    const bc = new BroadcastChannel(BROADCAST_CHANNEL);
    bc.postMessage({ sourceTab: getTabId() });
    bc.close();
  } catch {
    /* ignore */
  }
}

export const TODO_SYNC_BROADCAST_CHANNEL = BROADCAST_CHANNEL;

export { getTabId };
