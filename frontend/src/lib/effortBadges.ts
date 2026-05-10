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
    cls: "bg-violet-500 text-white dark:bg-violet-400",
  },
  heavy: {
    label: "Lourd",
    tKey: "effort.heavy",
    cls: "bg-orange-500 text-white dark:bg-orange-400",
  },
};
