"use client";

import { useLocale } from "@/lib/LocaleContext";
import { useFocusTrap } from "@/lib/useFocusTrap";

export interface TaskBlockerInfo {
  id: string;
  title: string;
}

interface Props {
  open: boolean;
  taskTitle: string;
  blockers: TaskBlockerInfo[];
  onClose: () => void;
  onOpenBlocker: (id: string) => void;
}

export default function TaskBlockedModal({ open, taskTitle, blockers, onClose, onOpenBlocker }: Props) {
  const { t } = useLocale();
  const trapRef = useFocusTrap(open);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-blocked-title"
        className="relative bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md border border-zinc-200 dark:border-slate-700 p-6"
      >
        <h2 id="task-blocked-title" className="text-lg font-semibold text-zinc-900 dark:text-slate-100">
          {t("dependencies.blockedTitle")}
        </h2>
        <p className="text-sm text-zinc-600 dark:text-slate-400 mt-2">
          {t("dependencies.blockedHint")} <span className="font-medium">{taskTitle}</span>
        </p>
        <ul className="mt-4 space-y-2 max-h-48 overflow-y-auto">
          {blockers.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => onOpenBlocker(b.id)}
                className="w-full text-left rounded-lg border border-zinc-200 dark:border-slate-600 px-3 py-2 text-sm text-zinc-800 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-800"
              >
                {b.title || t("todos.untitled")}
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-lg border border-zinc-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800"
        >
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}
