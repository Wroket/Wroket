"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "@/lib/LocaleContext";
import { postEarlyBirdEnroll } from "@/lib/api/earlyBird";
import { useFocusTrap } from "@/lib/useFocusTrap";
import type { TranslationKey } from "@/lib/i18n";

const STORAGE_KEY = "wroket-tutorial-v4-seen";

interface TutorialStep {
  titleKey: TranslationKey;
  descKey: TranslationKey;
  icon: string;
  color: string;
  variant?: "earlyBird";
}

const STEPS: TutorialStep[] = [
  { titleKey: "tutorial.step1.title", descKey: "tutorial.step1.desc", icon: "\ud83d\udcc5", color: "from-sky-500 to-blue-600" },
  { titleKey: "tutorial.step2.title", descKey: "tutorial.step2.desc", icon: "\u270f\ufe0f", color: "from-blue-500 to-indigo-600" },
  { titleKey: "tutorial.step3.title", descKey: "tutorial.step3.desc", icon: "\ud83d\udcc1", color: "from-amber-500 to-orange-600" },
  { titleKey: "tutorial.step4.title", descKey: "tutorial.step4.desc", icon: "\ud83d\udc65", color: "from-emerald-500 to-teal-600" },
  {
    titleKey: "tutorial.step5.title",
    descKey: "tutorial.step5.desc",
    icon: "\u2b50",
    color: "from-violet-500 to-purple-600",
    variant: "earlyBird",
  },
];

interface TutorialModalProps {
  open: boolean;
  onClose: () => void;
  earlyBird?: boolean;
  onEarlyBirdEnrolled?: () => Promise<void>;
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

export default function TutorialModal({ open, onClose, earlyBird = false, onEarlyBirdEnrolled }: TutorialModalProps) {
  const { t, locale } = useLocale();
  const trapRef = useFocusTrap(open);
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
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && step < STEPS.length - 1) setStep((s) => s + 1);
      if (e.key === "ArrowLeft" && step > 0) setStep((s) => s - 1);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, step, onClose]);

  const handleEarlyBirdEnroll = async () => {
    if (isEarlyBirdActive || enrolling) return;
    setEnrollError(null);
    setEnrolling(true);
    try {
      const result = await postEarlyBirdEnroll({ locale });
      if (result.ok) {
        setEnrollDone(true);
        await onEarlyBirdEnrolled?.();
        return;
      }
      if (result.status === 502) {
        setEnrollDone(true);
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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div ref={trapRef} role="dialog" aria-modal="true" aria-label={t("tutorial.title")} className="relative bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="h-1 bg-zinc-100 dark:bg-slate-800">
          <div
            className={`h-full bg-gradient-to-r ${current.color} transition-all duration-300`}
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        <div className={`bg-gradient-to-br ${current.color} px-6 py-8 text-center`}>
          <span className="text-5xl block mb-3">{current.icon}</span>
          {step === 0 ? (
            <>
              <h2 className="text-xl font-bold text-white">{t("tutorial.title")}</h2>
              <p className="text-white/90 text-base font-semibold mt-2">{t(current.titleKey)}</p>
            </>
          ) : (
            <h2 className="text-xl font-bold text-white">{t(current.titleKey)}</h2>
          )}
        </div>

        <div className="px-6 py-5">
          <p className="text-sm text-zinc-600 dark:text-slate-400 leading-relaxed">
            {t(current.descKey)}
          </p>
          {isEarlyBirdStep && isEarlyBirdActive && (
            <p className="mt-3 text-sm font-medium text-violet-700 dark:text-violet-300">
              {earlyBird && !enrollDone ? t("tutorial.earlyBird.successAlready") : t("tutorial.earlyBird.success")}
            </p>
          )}
          {enrollError && (
            <p role="alert" className="mt-3 text-sm text-amber-700 dark:text-amber-300">
              {enrollError}
            </p>
          )}
        </div>

        <div className="px-6 pb-5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setStep(i)}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === step
                    ? "w-6 bg-indigo-500 dark:bg-indigo-400"
                    : i < step
                      ? "bg-indigo-300 dark:bg-indigo-600"
                      : "bg-zinc-200 dark:bg-slate-700"
                }`}
              />
            ))}
            <span className="text-[10px] text-zinc-400 dark:text-slate-500 ml-2">
              {step + 1} {t("tutorial.stepOf")} {STEPS.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {step === 0 && (
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-zinc-400 dark:text-slate-500 hover:text-zinc-600 dark:hover:text-slate-300 transition-colors px-3 py-1.5"
              >
                {t("tutorial.skip")}
              </button>
            )}
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                disabled={enrolling}
                className="text-xs font-medium text-zinc-500 dark:text-slate-400 hover:text-zinc-700 dark:hover:text-slate-200 px-3 py-1.5 rounded border border-zinc-200 dark:border-slate-700 transition-colors disabled:opacity-50"
              >
                {t("tutorial.prev")}
              </button>
            )}
            {isLast ? (
              isEarlyBirdStep && !isEarlyBirdActive ? (
                <>
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={enrolling}
                    className="text-xs font-medium text-zinc-500 dark:text-slate-400 hover:text-zinc-700 dark:hover:text-slate-200 px-3 py-1.5 rounded border border-zinc-200 dark:border-slate-700 transition-colors disabled:opacity-50"
                  >
                    {t("tutorial.skip")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleEarlyBirdEnroll()}
                    disabled={enrolling}
                    className="text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600 px-4 py-1.5 rounded transition-colors disabled:opacity-50"
                  >
                    {enrolling ? t("tutorial.earlyBird.submitting") : t("tutorial.earlyBird.cta")}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 px-4 py-1.5 rounded transition-colors"
                >
                  {t("tutorial.finish")}
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 px-4 py-1.5 rounded transition-colors"
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
