"use client";

import { useEffect, useRef } from "react";

export type ResourceChannel = "todos" | "notes" | "projects" | "teams" | "agenda" | "dashboard";

/** Optional periodic pull while the document is visible (cross-device when other tabs cannot BroadcastChannel). */
export type UseResourceSyncOptions = {
  /** Minimum 10_000 ms. When set, `onRefresh` runs on this interval if the tab is not hidden. */
  pollIntervalMs?: number;
};

function getTabId(): string {
  if (typeof window === "undefined") return "";
  const w = window as Window & { __wroketTabId?: string };
  if (!w.__wroketTabId) w.__wroketTabId = crypto.randomUUID();
  return w.__wroketTabId;
}

/**
 * Generic cross-tab / cross-device refresh hook.
 *
 * Calls `onRefresh` (debounced, at most once per 100 ms) when:
 *   - the tab becomes visible again (`visibilitychange`),
 *   - the browser comes back online (`online`),
 *   - another tab broadcasts a mutation on the same channel (`BroadcastChannel`).
 *
 * Use `broadcastResourceChange(channel)` after successful API mutations to notify
 * other open tabs of the same user.
 *
 * When `options.pollIntervalMs` is set (>= 10_000), also calls `onRefresh` on that interval
 * while the document is visible — useful for multi-device alignment without manual buttons.
 */
export function useResourceSync(
  channel: ResourceChannel,
  onRefresh: () => void,
  options?: UseResourceSyncOptions,
): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalMs =
    options?.pollIntervalMs !== undefined && options.pollIntervalMs >= 10_000
      ? options.pollIntervalMs
      : undefined;

  useEffect(() => {
    const tabId = getTabId();

    const schedule = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        onRefresh();
      }, 100);
    };

    const onVisibility = () => {
      if (!document.hidden) schedule();
    };
    const onOnline = () => schedule();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(`wroket-${channel}-sync`);
      bc.onmessage = (ev: MessageEvent<{ sourceTab?: string }>) => {
        if (ev.data?.sourceTab === tabId) return;
        schedule();
      };
    } catch {
      /* BroadcastChannel not supported in this environment */
    }

    let pollId: ReturnType<typeof setInterval> | null = null;
    if (pollIntervalMs !== undefined) {
      pollId = setInterval(() => {
        if (!document.hidden) schedule();
      }, pollIntervalMs);
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      bc?.close();
      if (pollId !== null) clearInterval(pollId);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [channel, onRefresh, pollIntervalMs]);
}

/**
 * Notify other open tabs that data changed on the given channel.
 * Safe to call from any API mutation handler after a successful response.
 */
export function broadcastResourceChange(channel: ResourceChannel): void {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
  try {
    const bc = new BroadcastChannel(`wroket-${channel}-sync`);
    bc.postMessage({ sourceTab: getTabId() });
    bc.close();
  } catch {
    /* ignore — BroadcastChannel not available */
  }
}
