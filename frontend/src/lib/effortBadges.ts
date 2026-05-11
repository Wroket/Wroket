import type { Effort } from "./api";
import type { TranslationKey } from "./i18n";

export const EFFORT_BADGES: Record<
  Effort,
  { label: string; tKey: TranslationKey; cls: string }
> = {
  light: {
    label: "Léger",
    tKey: "effort.light",
    cls: "rounded-full bg-teal-100 text-teal-900 dark:bg-teal-900/30 dark:text-teal-200",
  },
  medium: {
    label: "Moyen",
    tKey: "effort.medium",
    cls: "rounded-full bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
  },
  heavy: {
    label: "Lourd",
    tKey: "effort.heavy",
    cls: "rounded-full bg-orange-100 text-orange-900 dark:bg-orange-900/30 dark:text-orange-200",
  },
};
