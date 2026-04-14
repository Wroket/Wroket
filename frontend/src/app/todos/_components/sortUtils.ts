import { classify } from "@/lib/classify";
import type { TranslationKey } from "@/lib/i18n";
import type { Todo, Priority } from "@/lib/api";
import type { Quadrant, FilterKey, SortColumn, SortDirection } from "@/lib/todoConstants";

export const FILTER_BUTTONS: {
  key: FilterKey;
  label: string;
  tKey: TranslationKey;
  icon: string;
  activeClass: string;
}[] = [
  { key: "do-first", label: "Faire", tKey: "filter.doFirst" as const, icon: "🔥", activeClass: "bg-red-600 text-white border-red-600" },
  { key: "schedule", label: "Planifier", tKey: "filter.schedule" as const, icon: "📅", activeClass: "bg-blue-600 text-white border-blue-600" },
  { key: "delegate", label: "Expédier", tKey: "filter.delegate" as const, icon: "⚡", activeClass: "bg-amber-500 text-white border-amber-500" },
  { key: "eliminate", label: "Différer", tKey: "filter.eliminate" as const, icon: "⏸️", activeClass: "bg-zinc-400 text-white border-zinc-400" },
  { key: "completed", label: "Accomplies", tKey: "filter.completed" as const, icon: "✅", activeClass: "bg-green-600 text-white border-green-600" },
  { key: "cancelled", label: "Annulées", tKey: "filter.cancelled" as const, icon: "🚫", activeClass: "bg-zinc-600 text-white border-zinc-600" },
  { key: "deleted", label: "Supprimées", tKey: "filter.deleted" as const, icon: "🗑️", activeClass: "bg-zinc-800 text-white border-zinc-800" },
];

export const QUADRANT_BADGES: Record<Quadrant, { label: string; tKey: TranslationKey; cls: string }> = {
  "do-first": { label: "🔥 Faire", tKey: "badge.doFirst" as const, cls: "bg-red-500 text-white dark:bg-red-600" },
  schedule: { label: "📅 Planifier", tKey: "badge.schedule" as const, cls: "bg-blue-500 text-white dark:bg-blue-600" },
  delegate: { label: "⚡ Expédier", tKey: "badge.delegate" as const, cls: "bg-amber-500 text-white dark:bg-amber-600" },
  eliminate: { label: "⏸️ Différer", tKey: "badge.eliminate" as const, cls: "bg-emerald-400 text-white dark:bg-emerald-600" },
};

export const QUADRANT_RANK: Record<Quadrant, number> = {
  "do-first": 1, schedule: 2, delegate: 3, eliminate: 4,
};
export const PRIORITY_RANK: Record<Priority, number> = {
  high: 1, medium: 2, low: 3,
};

export function sortTodos(
  todos: Todo[],
  column: SortColumn,
  direction: SortDirection,
  /** Horodatage partagé avec le radar (décroissance de l’urgence). */
  nowMs?: number,
): Todo[] {
  const sorted = [...todos];
  const dir = direction === "asc" ? 1 : -1;
  sorted.sort((a, b) => {
    switch (column) {
      case "classification":
        return dir * (QUADRANT_RANK[classify(a, nowMs)] - QUADRANT_RANK[classify(b, nowMs)]);
      case "priority":
        return dir * (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
      case "deadline": {
        const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
        const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
        return dir * (da - db);
      }
      default:
        return 0;
    }
  });
  return sorted;
}
