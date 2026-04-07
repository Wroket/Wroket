import type { CalendarEvent, Todo } from "@/lib/api";
import { classify, type EisenhowerQuadrant } from "@/lib/classify";

export const HOUR_HEIGHT = 60;
export const DAY_START_HOUR = 6;
export const DAY_END_HOUR = 22;
export const TOTAL_HOURS = DAY_END_HOUR - DAY_START_HOUR;

export const ACCOUNT_COLORS = [
  "#10b981", // emerald
  "#8b5cf6", // violet
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
  "#6366f1", // indigo
];

export const QUADRANT_COLORS: Record<EisenhowerQuadrant, { bg: string; border: string; text: string; icon: string; label: string }> = {
  "do-first": { bg: "bg-red-100 dark:bg-red-900/40", border: "border-red-500", text: "text-red-800 dark:text-red-200", icon: "🔥", label: "Faire" },
  "schedule":  { bg: "bg-blue-100 dark:bg-blue-900/40", border: "border-blue-500", text: "text-blue-800 dark:text-blue-200", icon: "📅", label: "Planifier" },
  "delegate":  { bg: "bg-amber-100 dark:bg-amber-900/40", border: "border-amber-500", text: "text-amber-800 dark:text-amber-200", icon: "⚡", label: "Expédier" },
  "eliminate":  { bg: "bg-zinc-100 dark:bg-slate-700/40", border: "border-zinc-400", text: "text-zinc-700 dark:text-zinc-300", icon: "⏸️", label: "Différer" },
};

export function classifyEvent(ev: CalendarEvent): EisenhowerQuadrant {
  const pseudo = {
    priority: (ev.priority ?? "medium") as Todo["priority"],
    effort: (ev.effort ?? "medium") as Todo["effort"],
    deadline: ev.deadline ?? null,
  } as Todo;
  return classify(pseudo);
}

/** Local midnight for YYYY-MM-DD (avoids UTC shift from `new Date("2026-04-09")`). */
export function parseCalendarDayFromIso(iso: string): Date {
  const ymd = iso.split("T")[0] ?? "";
  const parts = ymd.split("-").map((x) => parseInt(x, 10));
  if (parts.length === 3 && parts.every((n) => !Number.isNaN(n))) {
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  return new Date(iso);
}

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Next local midnight after `d` (exclusive end for “calendar day” intervals). */
function endOfLocalDayExclusive(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}

/**
 * Whether the event should appear on this calendar cell (all-day row or timed grid use the same geometry).
 * All-day Google events: start date inclusive, end date exclusive (RFC 5545 / Calendar API).
 */
export function eventVisibleOnCalendarDay(ev: CalendarEvent, day: Date): boolean {
  const dayStart = startOfLocalDay(day);
  const dayEnd = endOfLocalDayExclusive(day);

  if (ev.allDay) {
    const rangeStart = parseCalendarDayFromIso(ev.start).getTime();
    let rangeEndExclusive: number;
    if (!ev.end || ev.end === "") {
      rangeEndExclusive = rangeStart + 86400000;
    } else if (!ev.end.includes("T")) {
      rangeEndExclusive = parseCalendarDayFromIso(ev.end).getTime();
    } else {
      rangeEndExclusive = new Date(ev.end).getTime();
    }
    return rangeStart < dayEnd && rangeEndExclusive > dayStart;
  }

  const evStart = new Date(ev.start).getTime();
  const evEnd = new Date(ev.end).getTime();
  return evStart < dayEnd && evEnd > dayStart;
}

/**
 * Position of a timed event within the visible hour grid for a single day column (clips multi-day / overnight).
 */
export function getEventPositionForDay(event: CalendarEvent, day: Date): { top: number; height: number } {
  if (event.allDay) {
    return { top: 0, height: 22 };
  }
  const dayStart = startOfLocalDay(day);
  const dayEnd = endOfLocalDayExclusive(day);
  const evStart = new Date(event.start).getTime();
  const evEnd = new Date(event.end).getTime();
  const clipStart = Math.max(evStart, dayStart);
  const clipEnd = Math.min(evEnd, dayEnd);
  if (clipEnd <= clipStart) {
    return { top: 0, height: 22 };
  }

  const visibleStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), DAY_START_HOUR, 0, 0, 0).getTime();
  const visibleEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), DAY_END_HOUR, 0, 0, 0).getTime();

  const drawStart = Math.max(clipStart, visibleStart);
  const drawEnd = Math.min(clipEnd, visibleEnd);
  if (drawEnd <= drawStart) {
    return { top: 0, height: 22 };
  }

  const topMinutes = Math.max(0, (drawStart - visibleStart) / 60000);
  const durationMinutes = Math.max((drawEnd - drawStart) / 60000, 15);
  return {
    top: (topMinutes / 60) * HOUR_HEIGHT,
    height: Math.max((durationMinutes / 60) * HOUR_HEIGHT, 22),
  };
}

/** @deprecated Prefer getEventPositionForDay for week/day grids */
export function getEventPosition(event: CalendarEvent) {
  const start = new Date(event.start);
  const end = new Date(event.end);
  const topMinutes = (start.getHours() - DAY_START_HOUR) * 60 + start.getMinutes();
  const durationMinutes = (end.getTime() - start.getTime()) / 60000;
  return {
    top: (topMinutes / 60) * HOUR_HEIGHT,
    height: Math.max((durationMinutes / 60) * HOUR_HEIGHT, 20),
  };
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function formatHour(h: number): string {
  return `${h.toString().padStart(2, "0")}:00`;
}

export function hexToTintBg(hex: string, opacity = 0.15): string {
  const clean = hex.replace("#", "");
  if (clean.length < 6) return `rgba(16,185,129,${opacity})`;
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}
