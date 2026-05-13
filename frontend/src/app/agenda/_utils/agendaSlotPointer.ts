import { DAY_END_HOUR, DAY_START_HOUR, HOUR_HEIGHT } from "./calendarUtils";

const SNAP_MIN = 15;

export function findAgendaDayElement(clientX: number, clientY: number): HTMLElement | null {
  const stack = document.elementsFromPoint(clientX, clientY);
  for (const node of stack) {
    if (node instanceof HTMLElement && node.dataset.agendaDay) return node;
  }
  return null;
}

/**
 * Maps pointer position inside a day column to a new slot (local timezone),
 * snapping start to 15 minutes and preserving duration (clamped so the slot stays in the visible day).
 */
export function snappedStartEndFromPointerLocal(
  dayEl: HTMLElement,
  clientY: number,
  durationMs: number,
  dayYmd: string,
): { start: string; end: string } {
  const rect = dayEl.getBoundingClientRect();
  const y = clientY - rect.top;
  let minutesFromMidnight = (y / HOUR_HEIGHT) * 60 + DAY_START_HOUR * 60;
  minutesFromMidnight = Math.round(minutesFromMidnight / SNAP_MIN) * SNAP_MIN;

  const visStartMin = DAY_START_HOUR * 60;
  const visEndMin = DAY_END_HOUR * 60;
  const durMin = Math.max(SNAP_MIN, durationMs / 60000);

  let snapped = Math.max(visStartMin, Math.min(visEndMin - SNAP_MIN, minutesFromMidnight));
  if (snapped + durMin > visEndMin) {
    snapped = Math.max(visStartMin, visEndMin - durMin);
    snapped = Math.round(snapped / SNAP_MIN) * SNAP_MIN;
  }

  const parts = dayYmd.split("-").map((x) => parseInt(x, 10));
  const yy = parts[0]!;
  const mo = parts[1]!;
  const dd = parts[2]!;
  const visEndDate = new Date(yy, mo - 1, dd, DAY_END_HOUR, 0, 0, 0);
  let start = new Date(yy, mo - 1, dd, Math.floor(snapped / 60), snapped % 60, 0, 0);
  let end = new Date(start.getTime() + durationMs);
  if (end.getTime() > visEndDate.getTime()) {
    start = new Date(visEndDate.getTime() - durationMs);
    const sm = start.getHours() * 60 + start.getMinutes();
    const snapped2 = Math.round(Math.max(visStartMin, Math.min(visEndMin - durMin, sm)) / SNAP_MIN) * SNAP_MIN;
    start = new Date(yy, mo - 1, dd, Math.floor(snapped2 / 60), snapped2 % 60, 0, 0);
    end = new Date(start.getTime() + durationMs);
  }

  return { start: start.toISOString(), end: end.toISOString() };
}
