"use client";

import { useState } from "react";
import { useLocale } from "@/lib/LocaleContext";
import { postEarlyBirdEnroll } from "@/lib/api/earlyBird";
import { useAuth } from "@/components/AuthContext";

export type EarlyBirdUnlockVariant = "banner" | "compact";

interface EarlyBirdUnlockCardProps {
  /** Called after a successful enroll (and after session refresh). Defaults to AuthContext.refresh. */
  onEnrolled?: () => Promise<void>;
  variant?: EarlyBirdUnlockVariant;
  className?: string;
}

/**
 * Self-serve Early Bird enrollment — unlocks integrations (incl. Google Calendar)
 * without requiring Small teams. Used on calendar lock surfaces and Settings.
 */
export default function EarlyBirdUnlockCard({
  onEnrolled,
  variant = "banner",
  className = "",
}: EarlyBirdUnlockCardProps) {
  const { t, locale } = useLocale();
  const { refresh } = useAuth();
  const [enrolling, setEnrolling] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEnroll = async () => {
    if (enrolling || done) return;
    setError(null);
    setEnrolling(true);
    try {
      const result = await postEarlyBirdEnroll({ locale });
      if (result.ok || result.status === 502) {
        setDone(true);
        const { trackFunnelEvent } = await import("@/lib/productAnalytics");
        trackFunnelEvent("early_bird_or_calendar", { source: "early_bird_unlock_card" });
        await (onEnrolled ?? refresh)();
        if (!result.ok && result.status === 502) {
          setError(result.message);
        }
        return;
      }
      setError(result.message || t("tutorial.earlyBird.error"));
    } catch {
      setError(t("tutorial.earlyBird.error"));
    } finally {
      setEnrolling(false);
    }
  };

  const shell =
    variant === "banner"
      ? "rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5 dark:border-violet-800/60 dark:bg-violet-950/30"
      : "rounded-md border border-violet-200/80 bg-violet-50/80 px-3 py-2 dark:border-violet-800/50 dark:bg-violet-950/25";

  return (
    <div className={`${shell} ${className}`} data-early-bird-unlock={variant}>
      <p className="text-sm text-violet-950 dark:text-violet-100">
        {t(variant === "banner" ? "earlyBird.unlock.bannerBody" : "earlyBird.unlock.compactBody")}
      </p>
      {done ? (
        <p className="mt-2 text-sm font-medium text-violet-800 dark:text-violet-200" role="status">
          {t("tutorial.earlyBird.success")}
        </p>
      ) : (
        <button
          type="button"
          onClick={() => void handleEnroll()}
          disabled={enrolling}
          className="mt-2 inline-flex items-center justify-center rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600 transition-colors disabled:opacity-50"
        >
          {enrolling ? t("tutorial.earlyBird.submitting") : t("tutorial.earlyBird.cta")}
        </button>
      )}
      {error ? (
        <p role="alert" className="mt-2 text-xs text-amber-800 dark:text-amber-200">
          {error}
        </p>
      ) : null}
    </div>
  );
}
