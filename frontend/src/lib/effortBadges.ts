import type { Effort } from "./api";
import type { TranslationKey } from "./i18n";

export const EFFORT_BADGES: Record<
  Effort,
  { label: string; tKey: TranslationKey; cls: string }
> = {
  light: {
    label: "Léger",
    tKey: "effort.light" as TranslationKey,
    cls: "bg-sky-400 text-white dark:bg-sky-600",
  },
  medium: {
    label: "Moyen",
    tKey: "effort.medium" as TranslationKey,
    cls: "bg-[#6b8e23] text-white dark:bg-[#556b2f]",
  },
  heavy: {
    label: "Lourd",
    tKey: "effort.heavy" as TranslationKey,
    cls: "bg-purple-700 text-white dark:bg-purple-800",
  },
};
