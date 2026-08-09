"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useLocale } from "@/lib/LocaleContext";
import type { TranslationKey } from "@/lib/i18n";

/** Plan / quota tier shown on soft-locked features. */
export type SoftLockTier = "small" | "large" | "pro" | "freeQuota";

const BADGE_KEYS: Record<SoftLockTier, TranslationKey> = {
  small: "planRequired.badge.small",
  large: "planRequired.badge.large",
  pro: "planRequired.badge.pro",
  freeQuota: "planRequired.badge.freeQuota",
};

const DEFAULT_HINT_KEYS: Record<SoftLockTier, TranslationKey> = {
  small: "planRequired.small",
  large: "planRequired.large",
  pro: "planRequired.pro",
  freeQuota: "planRequired.freeQuota",
};

/**
 * Compact plan chip next to a feature title.
 * Soft-lock discovery signal — not a hide.
 */
export function PlanBadge({ tier, className = "" }: { tier: SoftLockTier; className?: string }) {
  const { t } = useLocale();
  return (
    <span
      className={`inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 px-2 py-0.5 text-[10px] font-semibold tracking-wide shrink-0 ${className}`}
    >
      {t(BADGE_KEYS[tier])}
    </span>
  );
}

/**
 * One-line hint + pricing CTA (always focusable / clickable).
 */
export function SoftLockHint({
  tier,
  hintKey,
  className = "",
}: {
  tier: SoftLockTier;
  hintKey?: TranslationKey;
  className?: string;
}) {
  const { t } = useLocale();
  return (
    <p className={`text-xs text-zinc-500 dark:text-slate-400 ${className}`}>
      <span>{t(hintKey ?? DEFAULT_HINT_KEYS[tier])} </span>
      <Link
        href="/pricing"
        className="font-medium text-emerald-700 dark:text-emerald-400 underline-offset-2 hover:underline"
      >
        {t("settings.viewAllPlans")}
      </Link>
    </p>
  );
}

/**
 * Soft-lock wrapper: when locked, shows badge + hint above children and blocks interaction.
 * Pricing CTA stays outside the inert region (in the header).
 */
export function SoftLock({
  locked,
  tier,
  hintKey,
  title,
  children,
  className = "",
}: {
  locked: boolean;
  tier: SoftLockTier;
  hintKey?: TranslationKey;
  /** Optional section title row (rendered with badge when locked). */
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  if (!locked) {
    return (
      <div className={className}>
        {title ? <div className="mb-2">{title}</div> : null}
        {children}
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        {title}
        <PlanBadge tier={tier} />
      </div>
      <SoftLockHint tier={tier} hintKey={hintKey} />
      <div
        className="opacity-60 pointer-events-none select-none"
        data-soft-locked="true"
        aria-disabled="true"
        ref={(el) => {
          if (!el) return;
          el.setAttribute("inert", "");
        }}
      >
        {children}
      </div>
    </div>
  );
}
