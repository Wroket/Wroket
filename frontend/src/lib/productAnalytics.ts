/**
 * Lightweight product analytics hooks. Dispatches a DOM event for optional listeners
 * (e.g. future PostHog/Plausible wiring) and calls `window.__wroketAnalytics` when defined.
 */

export type RadarAnalyticsEvent = "radar_view_enter" | "radar_mode_change" | "radar_open_edit";

export type RadarAnalyticsPayload = {
  todoId?: string;
  mode?: string;
};

declare global {
  interface Window {
    /** Optional sink: `(eventName, payload?) => void` for hosted analytics. */
    __wroketAnalytics?: (event: RadarAnalyticsEvent, payload?: RadarAnalyticsPayload) => void;
  }
}

export function trackRadarEvent(event: RadarAnalyticsEvent, payload?: RadarAnalyticsPayload): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("wroket_radar_analytics", {
      detail: { event, payload: payload ?? {}, ts: Date.now() },
    }),
  );
  try {
    window.__wroketAnalytics?.(event, payload);
  } catch {
    /* ignore third-party errors */
  }
}
