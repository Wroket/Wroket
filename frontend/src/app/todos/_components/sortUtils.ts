import { classify } from "@/lib/classify";
import type { TranslationKey } from "@/lib/i18n";
import type { Todo, Priority } from "@/lib/api";
import type { Quadrant, FilterKey, SortColumn, SortDirection } from "@/lib/todoConstants";
import { TAG_QUADRANT } from "@/lib/tagPalette";

export const FILTER_BUTTONS: {
  key: FilterKey;
  label: string;
  tKey: TranslationKey;
  icon: string;
  activeClass: string;
}[] = [
  { key: "do-first", label: "Prioriser", tKey: "filter.doFirst" as const, icon: "", activeClass: "bg-slate-700 text-white border-slate-700 dark:bg-slate-600 dark:border-slate-600" },
  { key: "schedule", label: "Planifier", tKey: "filter.schedule" as const, icon: "", activeClass: "bg-slate-700 text-white border-slate-700 dark:bg-slate-600 dark:border-slate-600" },
  { key: "delegate", label: "Faire", tKey: "filter.delegate" as const, icon: "", activeClass: "bg-slate-700 text-white border-slate-700 dark:bg-slate-600 dark:border-slate-600" },
  { key: "eliminate", label: "Différer", tKey: "filter.eliminate" as const, icon: "", activeClass: "bg-slate-700 text-white border-slate-700 dark:bg-slate-600 dark:border-slate-600" },
  { key: "completed", label: "Accomplies", tKey: "filter.completed" as const, icon: "", activeClass: "bg-slate-700 text-white border-slate-700 dark:bg-slate-600 dark:border-slate-600" },
  { key: "cancelled", label: "Annulées", tKey: "filter.cancelled" as const, icon: "", activeClass: "bg-slate-700 text-white border-slate-700 dark:bg-slate-600 dark:border-slate-600" },
  { key: "deleted", label: "Supprimées", tKey: "filter.deleted" as const, icon: "", activeClass: "bg-slate-700 text-white border-slate-700 dark:bg-slate-600 dark:border-slate-600" },
];

export const QUADRANT_BADGES: Record<Quadrant, { label: string; tKey: TranslationKey; cls: string }> = {
  "do-first": {
    label: "Prioriser",
    tKey: "badge.doFirst" as const,
    cls: TAG_QUADRANT["do-first"],
  },
  schedule: {
    label: "Planifier",
    tKey: "badge.schedule" as const,
    cls: TAG_QUADRANT.schedule,
  },
  delegate: {
    label: "Faire",
    tKey: "badge.delegate" as const,
    cls: TAG_QUADRANT.delegate,
  },
  eliminate: {
    label: "Différer",
    tKey: "badge.eliminate" as const,
    cls: TAG_QUADRANT.eliminate,
  },
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
