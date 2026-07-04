import { DAY_START_HOUR, HOUR_HEIGHT } from "./calendarUtils";
import { findAgendaDayElement, snappedStartEndFromPointerLocal } from "./agendaSlotPointer";

export type AgendaDragKind = "reschedule" | "book";

export interface AgendaDragSession {
  kind: AgendaDragKind;
  todoId: string;
  label: string;
  durationMs: number;
  startX: number;
  startY: number;
  pointerId: number;
  origStartMs?: number;
  origEndMs?: number;
  dragging: boolean;
}

export interface AgendaDragGhost {
  ymd: string;
  top: number;
  height: number;
  label: string;
}

const DRAG_THRESHOLD_SQ = 64;

/** Returns true once the pointer moved past the drag threshold. */
export function agendaDragPointerMove(
  session: AgendaDragSession,
  clientX: number,
  clientY: number,
): boolean {
  if (session.dragging) return true;
  const dx = clientX - session.startX;
  const dy = clientY - session.startY;
  if (dx * dx + dy * dy > DRAG_THRESHOLD_SQ) {
    session.dragging = true;
    return true;
  }
  return false;
}

export function agendaDragGhostFromPointer(
  clientX: number,
  clientY: number,
  durationMs: number,
  label: string,
): AgendaDragGhost | null {
  const dayEl = findAgendaDayElement(clientX, clientY);
  const ymd = dayEl?.dataset.agendaDay;
  if (!dayEl || !ymd) return null;

  const { start, end } = snappedStartEndFromPointerLocal(dayEl, clientY, durationMs, ymd);
  const startDate = new Date(start);
  const endDate = new Date(end);
  const topMin = startDate.getHours() * 60 + startDate.getMinutes() - DAY_START_HOUR * 60;
  const heightMin = Math.max(15, (endDate.getTime() - startDate.getTime()) / 60_000);

  return {
    ymd,
    top: (topMin / 60) * HOUR_HEIGHT,
    height: Math.max((heightMin / 60) * HOUR_HEIGHT, 14),
    label,
  };
}

export function agendaDragDropSlot(
  clientX: number,
  clientY: number,
  durationMs: number,
): { ymd: string; start: string; end: string } | null {
  const dayEl = findAgendaDayElement(clientX, clientY);
  const ymd = dayEl?.dataset.agendaDay;
  if (!dayEl || !ymd) return null;
  const { start, end } = snappedStartEndFromPointerLocal(dayEl, clientY, durationMs, ymd);
  return { ymd, start, end };
}
