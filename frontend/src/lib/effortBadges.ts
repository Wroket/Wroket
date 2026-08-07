import type { Effort } from "./api";
import type { TranslationKey } from "./i18n";
import { TAG_EFFORT } from "./tagPalette";

export const EFFORT_BADGES: Record<
  Effort,
  { label: string; tKey: TranslationKey; cls: string }
> = {
  light: {
    label: "Léger",
    tKey: "effort.light",
    cls: TAG_EFFORT.light,
  },
  medium: {
    label: "Moyen",
    tKey: "effort.medium",
    cls: TAG_EFFORT.medium,
  },
  heavy: {
    label: "Lourd",
    tKey: "effort.heavy",
    cls: TAG_EFFORT.heavy,
  },
};
