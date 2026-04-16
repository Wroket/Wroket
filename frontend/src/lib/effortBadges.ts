import type { Effort } from "./api";
import type { TranslationKey } from "./i18n";

export const EFFORT_BADGES: Record<
  Effort,
  { label: string; tKey: TranslationKey; cls: string }
> = {
  light: {
    label: "Léger",
    tKey: "effort.light",
    cls: "bg-teal-400 text-white dark:bg-teal-500",
  },
  medium: {
    label: "Moyen",
    tKey: "effort.medium",
    cls: "bg-blue-400 text-white dark:bg-blue-500",
  },
  heavy: {
    label: "Lourd",
    tKey: "effort.heavy",
    cls: "bg-indigo-500 text-white dark:bg-indigo-600",
  },
};
