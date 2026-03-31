"use client";

import { useEffect, useState } from "react";

import { useLocale } from "@/lib/LocaleContext";
import type { Todo, Priority, Effort } from "@/lib/api";
import type { TranslationKey } from "@/lib/i18n";
import { PRIORITY_BADGES } from "@/lib/todoConstants";

export interface SubtaskModalProps {
  parent: Todo | null;
  onClose: () => void;
  onCreateSubtask: (data: {
    title: string;
    priority: Priority;
    effort: Effort;
    deadline: string;
  }) => void;
  creating: boolean;
  existingSubtasks: Todo[];
  onCompleteSubtask: (todo: Todo) => void;
  onDeleteSubtask: (todo: Todo) => void;
}

export default function SubtaskModal({
  parent,
  onClose,
  onCreateSubtask,
  creating,
  existingSubtasks,
  onCompleteSubtask,
  onDeleteSubtask,
}: SubtaskModalProps) {
  const { t } = useLocale();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [effort, setEffort] = useState<Effort>("medium");
  const [deadline, setDeadline] = useState("");

  useEffect(() => {
    if (!parent) return;
    setTitle("");
    setPriority("medium");
    setEffort("medium");
    setDeadline("");
  }, [parent]);

  useEffect(() => {
    if (!parent) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [parent, onClose]);

  if (!parent) return null;

  const handleSubmit = () => {
    if (!title.trim()) return;
    onCreateSubtask({ title, priority, effort, deadline });
    setTitle("");
    setPriority("medium");
    setEffort("medium");
    setDeadline("");
  };

  // Suppress unused variable — onDeleteSubtask is part of the public API
  // for parent components that manage subtask deletion from within this modal.
  void onDeleteSubtask;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="subtask-modal-title"
        className="bg-white dark:bg-slate-900 rounded-lg shadow-2xl border border-zinc-200 dark:border-slate-700 w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          id="subtask-modal-title"
          className="text-lg font-semibold text-zinc-900 dark:text-slate-100 mb-1"
        >
          {t("subtask.add")}
        </h3>
        <p className="text-xs text-zinc-400 dark:text-slate-500 mb-4 truncate">
          ↳ {parent.title}
        </p>

        {existingSubtasks.length > 0 && (
          <ul className="space-y-1.5 mb-4 max-h-40 overflow-y-auto">
            {existingSubtasks.map((sub) => {
              const badge = PRIORITY_BADGES[sub.priority];
              return (
                <li key={sub.id} className="flex items-center gap-2 text-sm">
                  <button
                    onClick={() =>
                      onCompleteSubtask(sub)
                    }
                    className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                      sub.status === "completed"
                        ? "bg-green-500 border-green-500 text-white"
                        : "border-zinc-300 dark:border-slate-500 hover:border-green-500 text-transparent hover:text-green-500"
                    }`}
                  >
                    <svg
                      className="w-2.5 h-2.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </button>
                  <span
                    className={`flex-1 truncate ${
                      sub.status === "completed"
                        ? "line-through text-zinc-400"
                        : "text-zinc-700 dark:text-slate-300"
                    }`}
                  >
                    {sub.title}
                  </span>
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${badge.cls}`}
                  >
                    {t(badge.tKey)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="space-y-3">
          <input
            type="text"
            placeholder={t("subtask.placeholder")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && title.trim()) handleSubmit();
              if (e.key === "Escape") onClose();
            }}
            autoFocus
            className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400"
          />
          <div className="grid grid-cols-3 gap-2">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="rounded border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-xs text-zinc-900 dark:text-slate-100 dark:bg-slate-800"
            >
              <option value="high">{t("priority.high")}</option>
              <option value="medium">{t("priority.medium")}</option>
              <option value="low">{t("priority.low")}</option>
            </select>
            <select
              value={effort}
              onChange={(e) => setEffort(e.target.value as Effort)}
              className="rounded border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-xs text-zinc-900 dark:text-slate-100 dark:bg-slate-800"
            >
              <option value="light">{t("effort.light")}</option>
              <option value="medium">{t("effort.medium")}</option>
              <option value="heavy">{t("effort.heavy")}</option>
            </select>
            <input
              type="date"
              value={deadline}
              min={new Date().toISOString().split("T")[0]}
              onChange={(e) => setDeadline(e.target.value)}
              max={parent.deadline || undefined}
              className="rounded border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-xs text-zinc-900 dark:text-slate-100 dark:bg-slate-800"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-zinc-200 dark:border-slate-600 px-4 py-2 text-sm font-medium text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
          >
            {t("subtask.cancel")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-green-300 dark:border-green-700 px-4 py-2 text-sm font-medium text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/40 transition-colors"
          >
            {t("subtask.done")}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={creating || !title.trim()}
            className="rounded bg-slate-700 dark:bg-slate-600 px-5 py-2 text-sm font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-60 transition-colors"
          >
            {creating ? t("subtask.adding") : t("subtask.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
