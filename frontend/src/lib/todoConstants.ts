import type { Priority } from "./api";
import type { TranslationKey } from "./i18n";

export type Quadrant = "do-first" | "schedule" | "delegate" | "eliminate";
export type FilterKey = Quadrant | "completed" | "cancelled" | "deleted";
export type SortColumn = "classification" | "priority" | "deadline";
export type SortDirection = "asc" | "desc";

export const SORT_COLUMNS: SortColumn[] = ["classification", "priority", "deadline"];

export const QUADRANT_CONFIG: Record<
  Quadrant,
  {
    label: string;
    tKey: TranslationKey;
    icon: string;
    headerBg: string;
    headerText: string;
    cellBg: string;
    accentBar: string;
  }
> = {
  "do-first": {
    label: "FAIRE",
    tKey: "quadrant.doFirst" as const,
    icon: "🔥",
    headerBg: "bg-red-600 dark:bg-red-700",
    headerText: "text-white",
    cellBg: "bg-zinc-100/80 dark:bg-slate-800/60",
    accentBar: "bg-red-500",
  },
  schedule: {
    label: "PLANIFIER",
    tKey: "quadrant.schedule" as const,
    icon: "📅",
    headerBg: "bg-blue-600 dark:bg-blue-700",
    headerText: "text-white",
    cellBg: "bg-zinc-100/80 dark:bg-slate-800/60",
    accentBar: "bg-blue-500",
  },
  delegate: {
    label: "EXPÉDIER",
    tKey: "quadrant.delegate" as const,
    icon: "⚡",
    headerBg: "bg-amber-500 dark:bg-amber-600",
    headerText: "text-white",
    cellBg: "bg-zinc-100/80 dark:bg-slate-800/40",
    accentBar: "bg-amber-400",
  },
  eliminate: {
    label: "DIFFÉRER",
    tKey: "quadrant.eliminate" as const,
    icon: "⏸️",
    headerBg: "bg-zinc-400 dark:bg-slate-600",
    headerText: "text-white",
    cellBg: "bg-zinc-100/80 dark:bg-slate-800/40",
    accentBar: "bg-zinc-300 dark:bg-slate-500",
  },
};

export const PRIORITY_BADGES: Record<
  Priority,
  { label: string; tKey: TranslationKey; cls: string }
> = {
  high: {
    label: "Haute",
    tKey: "priority.high" as const,
    cls: "bg-red-500 text-white dark:bg-red-600",
  },
  medium: {
    label: "Moyenne",
    tKey: "priority.medium" as const,
    cls: "bg-amber-500 text-white dark:bg-amber-600",
  },
  low: {
    label: "Basse",
    tKey: "priority.low" as const,
    cls: "bg-emerald-400 text-white dark:bg-emerald-600",
  },
};

export const SUBTASK_BADGE_CLS = "bg-emerald-600 text-white dark:bg-emerald-500";
