"use client";

import { useLocale } from "@/lib/LocaleContext";

interface EarlyBirdBadgeProps {
  /** Compact label for narrow headers (e.g. "EB"). */
  compact?: boolean;
  className?: string;
}

export default function EarlyBirdBadge({ compact = false, className = "" }: EarlyBirdBadgeProps) {
  const { t } = useLocale();
  const label = compact ? "EB" : t("header.earlyBirdBadge");

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-200 ${className}`}
      title={t("header.earlyBirdBadge")}
      aria-label={t("header.earlyBirdBadge")}
    >
      {label}
    </span>
  );
}
