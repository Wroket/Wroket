/**
 * Lightweight product analytics. Dispatches DOM events and calls `window.__wroketAnalytics` when defined.
 */

export type RadarAnalyticsEvent = "radar_view_enter" | "radar_mode_change" | "radar_open_edit";

export type FunnelAnalyticsEvent =
  | "signup_ok"
  | "early_bird_or_calendar"
  | "first_slot_booked"
  | "slot_synced_external"
  | "project_created"
  | "project_task_created"
  | "note_created"
  | "data_exported"
  | "data_imported";

export type ProductAnalyticsEvent = RadarAnalyticsEvent | FunnelAnalyticsEvent;

export type ProductAnalyticsPayload = {
  todoId?: string;
  mode?: string;
  source?: string;
};

declare global {
  interface Window {
    /** Optional sink: `(eventName, payload?) => void` for hosted analytics. */
    __wroketAnalytics?: (event: ProductAnalyticsEvent, payload?: ProductAnalyticsPayload) => void;
  }
}

function emit(event: ProductAnalyticsEvent, payload?: ProductAnalyticsPayload): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("wroket_product_analytics", {
      detail: { event, payload: payload ?? {}, ts: Date.now() },
    }),
  );
  // Legacy alias for radar listeners
  if (event.startsWith("radar_")) {
    window.dispatchEvent(
      new CustomEvent("wroket_radar_analytics", {
        detail: { event, payload: payload ?? {}, ts: Date.now() },
      }),
    );
  }
  try {
    window.__wroketAnalytics?.(event, payload);
  } catch {
    /* ignore third-party errors */
  }
}

export function trackRadarEvent(event: RadarAnalyticsEvent, payload?: ProductAnalyticsPayload): void {
  emit(event, payload);
}

/** Funnel Path to 9: signup → calendar entitlement → first slot → external sync. */
export function trackFunnelEvent(event: FunnelAnalyticsEvent, payload?: ProductAnalyticsPayload): void {
  emit(event, payload);
  if (event === "first_slot_booked" && typeof window !== "undefined") {
    try {
      const key = "wroket_first_slot_tracked";
      if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
  }
}
