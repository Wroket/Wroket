import type { TranslationKey } from "./i18n";

export type TranslationFunction = (key: TranslationKey) => string;

export interface DeadlineInfo {
  text: string;
  cls: string;
  urgent?: boolean;
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

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(deadline);
  target.setHours(0, 0, 0, 0);

  const diff = Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diff < 0)
    return {
      text: t("deadline.overdue" as TranslationKey),
      cls: "bg-red-500 text-white",
      urgent: true,
    };

  if (diff === 0)
    return {
      text: t("deadline.today" as TranslationKey),
      cls: "bg-orange-500 text-white",
      urgent: true,
    };

  if (diff === 1)
    return {
      text: t("deadline.tomorrow" as TranslationKey),
      cls: "bg-amber-500 text-white",
      urgent: true,
    };

  if (diff <= 7)
    return {
      text: `${diff} ${t("deadline.daysLeft" as TranslationKey)}`,
      cls: "bg-sky-500 text-white",
      urgent: diff <= 3,
    };

  return {
    text: target.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    }),
    cls: "bg-zinc-300 text-zinc-700 dark:bg-slate-600 dark:text-slate-300",
    urgent: false,
  };
}
