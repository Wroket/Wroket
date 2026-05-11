import type { TranslationKey } from "./i18n";

export type TranslationFunction = (key: TranslationKey) => string;

export interface DeadlineInfo {
  text: string;
  cls: string;
  urgent?: boolean;
}

/**
 * Parse a task deadline into a local calendar day at00:00.
 * `YYYY-MM-DD` is treated as that calendar date in the user's timezone (avoids UTC off-by-one).
 */
export function parseDeadlineToLocalDay(deadline: string): Date {
  const trimmed = deadline.trim();
  const isoDay = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoDay) {
    const y = Number(isoDay[1]);
    const m = Number(isoDay[2]) - 1;
    const d = Number(isoDay[3]);
    return new Date(y, m, d, 0, 0, 0, 0);
  }
  const x = new Date(trimmed);
  if (Number.isNaN(x.getTime())) {
    return new Date(NaN);
  }
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Whole days from today (local) to deadline day; negative = overdue. */
export function deadlineDayDiff(deadline: string, now: Date = new Date()): number {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const target = parseDeadlineToLocalDay(deadline);
  if (Number.isNaN(target.getTime())) return Number.NaN;
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Canonical deadline label covering all edge cases across the app:
 *   overdue, today, tomorrow, this week (≤7d), and later.
 *
 * Returns `null` when no deadline is provided.
 */
export function deadlineLabel(
  deadline: string | null,
  t: TranslationFunction,
): DeadlineInfo | null {
  if (!deadline) return null;

  const diff = deadlineDayDiff(deadline);
  if (Number.isNaN(diff)) return null;

  const target = parseDeadlineToLocalDay(deadline);

  if (diff < 0)
    return {
      text: t("deadline.overdue"),
      cls: "rounded-full bg-rose-100 text-rose-900 dark:bg-rose-900/35 dark:text-rose-200",
      urgent: true,
    };

  if (diff === 0)
    return {
      text: t("deadline.today"),
      cls: "rounded-full bg-orange-100 text-orange-900 dark:bg-orange-900/30 dark:text-orange-200",
      urgent: true,
    };

  if (diff === 1)
    return {
      text: t("deadline.tomorrow"),
      cls: "rounded-full bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
      urgent: true,
    };

  if (diff <= 7)
    return {
      text: `${diff} ${t("deadline.daysLeft")}`,
      cls: "rounded-full bg-sky-100 text-sky-900 dark:bg-sky-900/30 dark:text-sky-300",
      urgent: diff <= 3,
    };

  return {
    text: target.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    }),
    cls: "rounded-full bg-zinc-200 text-zinc-800 dark:bg-slate-600/50 dark:text-slate-300",
    urgent: false,
  };
}
