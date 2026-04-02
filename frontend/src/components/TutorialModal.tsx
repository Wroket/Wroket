"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "@/lib/LocaleContext";
import { useFocusTrap } from "@/lib/useFocusTrap";
import type { TranslationKey } from "@/lib/i18n";

const STORAGE_KEY = "wroket-tutorial-seen";

interface TutorialStep {
  titleKey: TranslationKey;
  descKey: TranslationKey;
  icon: string;
  color: string;
}

const STEPS: TutorialStep[] = [
  { titleKey: "tutorial.step1.title", descKey: "tutorial.step1.desc", icon: "✏️", color: "from-blue-500 to-indigo-600" },
  { titleKey: "tutorial.step2.title", descKey: "tutorial.step2.desc", icon: "👁️", color: "from-violet-500 to-purple-600" },
  { titleKey: "tutorial.step3.title", descKey: "tutorial.step3.desc", icon: "📁", color: "from-amber-500 to-orange-600" },
  { titleKey: "tutorial.step4.title", descKey: "tutorial.step4.desc", icon: "📅", color: "from-sky-500 to-blue-600" },
  { titleKey: "tutorial.step5.title", descKey: "tutorial.step5.desc", icon: "📝", color: "from-teal-500 to-cyan-600" },
  { titleKey: "tutorial.step6.title", descKey: "tutorial.step6.desc", icon: "👥", color: "from-emerald-500 to-teal-600" },
  { titleKey: "tutorial.step7.title", descKey: "tutorial.step7.desc", icon: "🚀", color: "from-rose-500 to-pink-600" },
];

interface TutorialModalProps {
  open: boolean;
  onClose: () => void;
}

export function useTutorial() {
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = localStorage.getItem(STORAGE_KEY);
    if (!seen) {
      setShowTutorial(true);
    }
  }, []);

  const openTutorial = useCallback(() => setShowTutorial(true), []);

  const closeTutorial = useCallback(() => {
    setShowTutorial(false);
    localStorage.setItem(STORAGE_KEY, "1");
  }, []);

  return { showTutorial, openTutorial, closeTutorial };
}

export default function TutorialModal({ open, onClose }: TutorialModalProps) {
  const { t } = useLocale();
  const trapRef = useFocusTrap(open);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (open) setStep(0);
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

  if (!open) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div ref={trapRef} role="dialog" aria-modal="true" aria-label={t("tutorial.title")} className="relative bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Progress bar */}
        <div className="h-1 bg-zinc-100 dark:bg-slate-800">
          <div
            className={`h-full bg-gradient-to-r ${current.color} transition-all duration-300`}
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Icon area */}
        <div className={`bg-gradient-to-br ${current.color} px-6 py-8 text-center`}>
          <span className="text-5xl block mb-3">{current.icon}</span>
          <h2 className="text-xl font-bold text-white">
            {step === 0 && step === 0 ? t("tutorial.title") : t(current.titleKey)}
          </h2>
          {step === 0 && (
            <p className="text-white/70 text-sm mt-1">{t(current.titleKey)}</p>
          )}
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          {step > 0 && (
            <h3 className="text-base font-semibold text-zinc-800 dark:text-slate-200 mb-2">
              {t(current.titleKey)}
            </h3>
          )}
          <p className="text-sm text-zinc-600 dark:text-slate-400 leading-relaxed">
            {t(current.descKey)}
          </p>
        </div>

        {/* Footer */}
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
                className="text-xs font-medium text-zinc-500 dark:text-slate-400 hover:text-zinc-700 dark:hover:text-slate-200 px-3 py-1.5 rounded border border-zinc-200 dark:border-slate-700 transition-colors"
              >
                {t("tutorial.prev")}
              </button>
            )}
            <button
              type="button"
              onClick={isLast ? onClose : () => setStep((s) => s + 1)}
              className="text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 px-4 py-1.5 rounded transition-colors"
            >
              {isLast ? t("tutorial.finish") : t("tutorial.next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
