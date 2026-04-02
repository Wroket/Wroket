"use client";

import { useEffect, useRef } from "react";
import { useLocale } from "@/lib/LocaleContext";

export interface DeleteTaskDialogProps {
  open: boolean;
  taskTitle: string;
  subtaskCount: number;
  onCancel: () => void;
  /** Delete the task only; promote subtasks to standalone tasks */
  onDeleteAndPromote: () => void;
  /** Delete the task and all its subtasks */
  onDeleteAll: () => void;
}

export default function DeleteTaskDialog({
  open,
  taskTitle,
  subtaskCount,
  onCancel,
  onDeleteAndPromote,
  onDeleteAll,
}: DeleteTaskDialogProps) {
  const { t } = useLocale();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      if (e.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  const hasSubtasks = subtaskCount > 0;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-task-dialog-title"
        className="relative bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
      >
        <h2 id="delete-task-dialog-title" className="text-lg font-semibold text-zinc-900 dark:text-slate-100">
          {t("task.deleteTitle")}
        </h2>
        <p className="mt-1 text-sm font-medium text-zinc-700 dark:text-slate-300">
          {taskTitle}
        </p>
        <p className="mt-2 text-sm text-zinc-600 dark:text-slate-400">
          {hasSubtasks
            ? `${subtaskCount} ${t((subtaskCount > 1 ? "task.deleteSubtaskMany" : "task.deleteSubtaskOne"))} — ${t("task.deleteConfirmMessage")}`
            : t("task.deleteConfirmSimple")}
        </p>
        <div className={`mt-6 grid gap-3 ${hasSubtasks ? "grid-cols-3" : "grid-cols-2"}`}>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-md border border-zinc-300 dark:border-slate-600
              text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-700 transition-colors text-center"
          >
            {t("cancel")}
          </button>
          {hasSubtasks ? (
            <>
              <button
                type="button"
                onClick={onDeleteAndPromote}
                className="px-4 py-2 text-sm rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors
                  focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 text-center"
              >
                {t("task.deletePromoteSubtasks")}
              </button>
              <button
                type="button"
                onClick={onDeleteAll}
                className="px-4 py-2 text-sm rounded-md text-white bg-red-600 hover:bg-red-700 transition-colors
                  focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 text-center"
              >
                {t("task.deleteAll")}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onDeleteAndPromote}
              className="px-4 py-2 text-sm rounded-md text-white bg-red-600 hover:bg-red-700 transition-colors
                focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 text-center"
            >
              {t("task.delete")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
