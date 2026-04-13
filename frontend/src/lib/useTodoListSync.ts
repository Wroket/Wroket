"use client";

import { useEffect } from "react";

import { getTabId, TODO_SYNC_BROADCAST_CHANNEL } from "./todoSyncBroadcast";

/**
 * Refetch todo lists when the tab becomes visible again, and when another tab broadcasts a mutation.
 */
export function useTodoListSync(onRefresh: () => void): void {
  useEffect(() => {
    const tabId = getTabId();
    const onVisibility = () => {
      if (document.hidden) return;
      onRefresh();
    };
    document.addEventListener("visibilitychange", onVisibility);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(TODO_SYNC_BROADCAST_CHANNEL);
      bc.onmessage = (ev: MessageEvent<{ sourceTab?: string }>) => {
        if (ev.data?.sourceTab === tabId) return;
        onRefresh();
      };
    } catch {
      /* unsupported */
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      bc?.close();
    };
  }, [onRefresh]);
}
