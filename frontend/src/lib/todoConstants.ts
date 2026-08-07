import type { Priority } from "./api";
import type { TranslationKey } from "./i18n";
import { TAG_AUX, TAG_PRIORITY } from "./tagPalette";

export type Quadrant = "do-first" | "schedule" | "delegate" | "eliminate";
export type FilterKey = Quadrant | "completed" | "cancelled" | "deleted";
export type SortColumn = "classification" | "priority" | "deadline";
export type SortDirection = "asc" | "desc";

export type QuadrantIconId = "priority" | "calendar" | "bolt" | "defer";

export const SORT_COLUMNS: SortColumn[] = ["classification", "priority", "deadline"];

/**
 * Eisenhower matrix chrome — muted slate surfaces + thin semantic accents (no emoji / neon fills).
 */
export const QUADRANT_CONFIG: Record<
  Quadrant,
  {
    label: string;
    tKey: TranslationKey;
    icon: QuadrantIconId;
    headerBg: string;
    headerText: string;
    iconClass: string;
    cellBg: string;
    accentBar: string;
  }
> = {
  "do-first": {
    label: "PRIORISER",
    tKey: "quadrant.doFirst" as const,
    icon: "priority",
    headerBg: "bg-zinc-100/90 dark:bg-slate-800/90 border-b border-rose-200/70 dark:border-rose-900/40",
    headerText: "text-zinc-800 dark:text-slate-100",
    iconClass: "text-rose-700 dark:text-rose-400",
    cellBg: "bg-zinc-50/80 dark:bg-slate-900/40",
    accentBar: "bg-rose-600 dark:bg-rose-500",
  },
  schedule: {
    label: "PLANIFIER",
    tKey: "quadrant.schedule" as const,
    icon: "calendar",
    headerBg: "bg-zinc-100/90 dark:bg-slate-800/90 border-b border-indigo-200/70 dark:border-indigo-900/40",
    headerText: "text-zinc-800 dark:text-slate-100",
    iconClass: "text-indigo-700 dark:text-indigo-400",
    cellBg: "bg-zinc-50/80 dark:bg-slate-900/40",
    accentBar: "bg-indigo-600 dark:bg-indigo-500",
  },
  delegate: {
    label: "FAIRE",
    tKey: "quadrant.delegate" as const,
    icon: "bolt",
    headerBg: "bg-zinc-100/90 dark:bg-slate-800/90 border-b border-amber-200/60 dark:border-amber-900/35",
    headerText: "text-zinc-800 dark:text-slate-100",
    iconClass: "text-amber-800 dark:text-amber-500",
    cellBg: "bg-zinc-50/80 dark:bg-slate-900/40",
    accentBar: "bg-amber-700 dark:bg-amber-600",
  },
  eliminate: {
    label: "DIFFÉRER",
    tKey: "quadrant.eliminate" as const,
    icon: "defer",
    headerBg: "bg-zinc-100/90 dark:bg-slate-800/90 border-b border-zinc-200 dark:border-slate-700",
    headerText: "text-zinc-800 dark:text-slate-100",
    iconClass: "text-zinc-500 dark:text-slate-400",
    cellBg: "bg-zinc-50/80 dark:bg-slate-900/40",
    accentBar: "bg-zinc-400 dark:bg-zinc-500",
  },
};

export const PRIORITY_BADGES: Record<
  Priority,
  { label: string; tKey: TranslationKey; cls: string }
> = {
  high: {
    label: "Haute",
    tKey: "priority.high" as const,
    cls: TAG_PRIORITY.high,
  },
  medium: {
    label: "Moyenne",
    tKey: "priority.medium" as const,
    cls: TAG_PRIORITY.medium,
  },
  low: {
    label: "Basse",
    tKey: "priority.low" as const,
    cls: TAG_PRIORITY.low,
  },
};

/** Subtask expand chip — same “soft” family as landing hero preview. */
export const SUBTASK_BADGE_CLS = TAG_AUX.subtask;
