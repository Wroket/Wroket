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
