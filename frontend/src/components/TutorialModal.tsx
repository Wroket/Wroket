"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useLocale } from "@/lib/LocaleContext";
import { postEarlyBirdEnroll } from "@/lib/api/earlyBird";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { useModalCloseKeys } from "@/lib/useModalCloseKeys";
import type { TranslationKey } from "@/lib/i18n";

/** Bumped when onboarding copy/UX changes so users see the V2 tour once. */
const STORAGE_KEY = "wroket-tutorial-v6-seen";

interface TutorialStep {
  titleKey: TranslationKey;
  descKey: TranslationKey;
  icon: ReactNode;
  variant?: "earlyBird";
}

function StepIcon({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-12 w-12 items-center justify-center rounded-sm border border-teal-200/80 dark:border-teal-800/60 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300">
      {children}
    </span>
  );
}

const STEPS: TutorialStep[] = [
  {
    titleKey: "tutorial.step1.title",
    descKey: "tutorial.step1.desc",
    icon: (
      <StepIcon>
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      </StepIcon>
    ),
  },
  {
    titleKey: "tutorial.step2.title",
    descKey: "tutorial.step2.desc",
    icon: (
      <StepIcon>
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </StepIcon>
    ),
  },
  {
    titleKey: "tutorial.step3.title",
    descKey: "tutorial.step3.desc",
    icon: (
      <StepIcon>
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      </StepIcon>
    ),
  },
  {
    titleKey: "tutorial.step4.title",
    descKey: "tutorial.step4.desc",
    icon: (
      <StepIcon>
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      </StepIcon>
    ),
  },
  {
    titleKey: "tutorial.step5.title",
    descKey: "tutorial.step5.desc",
    icon: (
      <StepIcon>
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
      </StepIcon>
    ),
    variant: "earlyBird",
  },
];

interface TutorialModalProps {
  open: boolean;
  onClose: () => void;
  earlyBird?: boolean;
  onEarlyBirdEnrolled?: () => Promise<void>;
  /** After finish / skip on last step — e.g. navigate to first win. */
  onFinishNavigate?: () => void;
}

export function useTutorial() {
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = localStorage.getItem(STORAGE_KEY);
    if (!seen) {
      void Promise.resolve().then(() => setShowTutorial(true));
    }
  }, []);

  const openTutorial = useCallback(() => setShowTutorial(true), []);

  const closeTutorial = useCallback(() => {
    setShowTutorial(false);
    localStorage.setItem(STORAGE_KEY, "1");
  }, []);

  return { showTutorial, openTutorial, closeTutorial };
}

export default function TutorialModal({
  open,
  onClose,
  earlyBird = false,
  onEarlyBirdEnrolled,
  onFinishNavigate,
}: TutorialModalProps) {
  const { t, locale } = useLocale();
  const trapRef = useFocusTrap(open);
  useModalCloseKeys(open, onClose);
  const [step, setStep] = useState(0);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollDone, setEnrollDone] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  const isEarlyBirdActive = earlyBird || enrollDone;

  useEffect(() => {
    if (open) {
      void Promise.resolve().then(() => {
        setStep(0);
        setEnrolling(false);
        setEnrollDone(false);
        setEnrollError(null);
      });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && step < STEPS.length - 1) setStep((s) => s + 1);
      if (e.key === "ArrowLeft" && step > 0) setStep((s) => s - 1);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, step]);

  const finish = () => {
    onClose();
    onFinishNavigate?.();
  };

  const handleEarlyBirdEnroll = async () => {
    if (isEarlyBirdActive || enrolling) return;
    setEnrollError(null);
    setEnrolling(true);
    try {
      const result = await postEarlyBirdEnroll({ locale });
      if (result.ok) {
        setEnrollDone(true);
        const { trackFunnelEvent } = await import("@/lib/productAnalytics");
        trackFunnelEvent("early_bird_or_calendar", { source: "tutorial" });
        await onEarlyBirdEnrolled?.();
        return;
      }
      if (result.status === 502) {
        setEnrollDone(true);
        const { trackFunnelEvent } = await import("@/lib/productAnalytics");
        trackFunnelEvent("early_bird_or_calendar", { source: "tutorial" });
        await onEarlyBirdEnrolled?.();
        setEnrollError(result.message);
        return;
      }
      setEnrollError(result.message || t("tutorial.earlyBird.error"));
    } catch {
      setEnrollError(t("tutorial.earlyBird.error"));
    } finally {
      setEnrolling(false);
    }
  };

  if (!open) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isEarlyBirdStep = current.variant === "earlyBird";
  const progressPct = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-zinc-900/40 dark:bg-black/60 backdrop-blur-[2px]"
        aria-label={t("tutorial.skip")}
        onClick={onClose}
      />

      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-dialog-title"
        className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-sm border border-zinc-200 dark:border-slate-700 shadow-lg ui-v2-fade max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div className="h-0.5 bg-zinc-100 dark:bg-slate-800 shrink-0">
          <div
            className="h-full bg-teal-600 dark:bg-teal-500 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-zinc-100 dark:border-slate-800 shrink-0">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-teal-700 dark:text-teal-400">
              {t("tutorial.title")}
            </p>
            <h2
              id="tutorial-dialog-title"
              className="mt-1 text-base font-semibold text-zinc-900 dark:text-slate-100"
            >
              {t(current.titleKey)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-slate-200 hover:bg-zinc-100 dark:hover:bg-slate-800 transition-colors shrink-0"
            aria-label={t("tutorial.skip")}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-5 overflow-y-auto flex-1 min-h-0">
          <div className="flex flex-col sm:flex-row gap-4 sm:items-start">
            <div className="shrink-0">{current.icon}</div>
            <div className="min-w-0 space-y-3">
              <p className="text-sm text-zinc-600 dark:text-slate-400 leading-relaxed">
                {t(current.descKey)}
              </p>
              {isEarlyBirdStep && isEarlyBirdActive && (
                <p className="text-sm font-medium text-teal-800 dark:text-teal-300">
                  {earlyBird && !enrollDone
                    ? t("tutorial.earlyBird.successAlready")
                    : t("tutorial.earlyBird.success")}
                </p>
              )}
              {enrollError && (
                <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">
                  {enrollError}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-zinc-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setStep(i)}
                aria-label={`${i + 1} ${t("tutorial.stepOf")} ${STEPS.length}`}
                className={`h-2 rounded-full transition-all ${
                  i === step
                    ? "w-6 bg-teal-600 dark:bg-teal-500"
                    : i < step
                      ? "w-2 bg-teal-300 dark:bg-teal-700"
                      : "w-2 bg-zinc-200 dark:bg-slate-700"
                }`}
              />
            ))}
            <span className="text-[10px] text-zinc-400 dark:text-slate-500 ml-2 tabular-nums">
              {step + 1} {t("tutorial.stepOf")} {STEPS.length}
            </span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {step === 0 && (
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-zinc-500 dark:text-slate-400 hover:text-zinc-700 dark:hover:text-slate-200 transition-colors px-3 py-1.5"
              >
                {t("tutorial.skip")}
              </button>
            )}
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                disabled={enrolling}
                className="text-xs font-medium text-zinc-600 dark:text-slate-300 hover:text-zinc-900 dark:hover:text-slate-100 px-3 py-1.5 rounded-sm border border-zinc-200 dark:border-slate-700 transition-colors disabled:opacity-50"
              >
                {t("tutorial.prev")}
              </button>
            )}
            {isLast ? (
              isEarlyBirdStep && !isEarlyBirdActive ? (
                <>
                  <button
                    type="button"
                    onClick={finish}
                    disabled={enrolling}
                    className="text-xs font-medium text-zinc-600 dark:text-slate-300 hover:text-zinc-900 dark:hover:text-slate-100 px-3 py-1.5 rounded-sm border border-zinc-200 dark:border-slate-700 transition-colors disabled:opacity-50"
                  >
                    {t("tutorial.skip")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleEarlyBirdEnroll()}
                    disabled={enrolling}
                    className="text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 px-4 py-1.5 rounded-sm transition-colors disabled:opacity-50"
                  >
                    {enrolling ? t("tutorial.earlyBird.submitting") : t("tutorial.earlyBird.cta")}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={finish}
                  className="text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 px-4 py-1.5 rounded-sm transition-colors"
                >
                  {t("tutorial.finish")}
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 px-4 py-1.5 rounded-sm transition-colors"
              >
                {t("tutorial.next")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
