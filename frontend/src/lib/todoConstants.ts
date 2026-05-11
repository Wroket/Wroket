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
    headerBg: "bg-red-500 dark:bg-red-950/90",
    headerText: "text-white",
    cellBg: "bg-zinc-100/80 dark:bg-slate-800/60",
    accentBar: "bg-red-500 dark:bg-red-600",
  },
  schedule: {
    label: "PLANIFIER",
    tKey: "quadrant.schedule" as const,
    icon: "📅",
    headerBg: "bg-blue-500 dark:bg-blue-950/90",
    headerText: "text-white",
    cellBg: "bg-zinc-100/80 dark:bg-slate-800/60",
    accentBar: "bg-blue-500 dark:bg-blue-600",
  },
  delegate: {
    label: "EXPÉDIER",
    tKey: "quadrant.delegate" as const,
    icon: "⚡",
    headerBg: "bg-amber-400 dark:bg-amber-950/90",
    headerText: "text-white",
    cellBg: "bg-zinc-100/80 dark:bg-slate-800/60",
    accentBar: "bg-amber-400 dark:bg-amber-600",
  },
  eliminate: {
    label: "DIFFÉRER",
    tKey: "quadrant.eliminate" as const,
    icon: "⏸️",
    headerBg: "bg-zinc-400 dark:bg-zinc-800/90",
    headerText: "text-white",
    cellBg: "bg-zinc-100/80 dark:bg-slate-800/60",
    accentBar: "bg-zinc-400 dark:bg-zinc-600",
  },
};

export const PRIORITY_BADGES: Record<
  Priority,
  { label: string; tKey: TranslationKey; cls: string }
> = {
  high: {
    label: "Haute",
    tKey: "priority.high" as const,
    cls: "rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  },
  medium: {
    label: "Moyenne",
    tKey: "priority.medium" as const,
    cls: "rounded-full bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
  },
  low: {
    label: "Basse",
    tKey: "priority.low" as const,
    cls: "rounded-full bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
  },
};

/** Subtask expand chip — same “soft” family as landing hero preview. */
export const SUBTASK_BADGE_CLS =
  "rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/45";
