"use client";

import { useEffect } from "react";

import { useLocale } from "@/lib/LocaleContext";
import type { Todo, Priority, Effort, AuthMeResponse } from "@/lib/api";
import type { TranslationKey } from "@/lib/i18n";

export interface TaskEditModalProps {
  todo: Todo | null;
  form: {
    title: string;
    priority: Priority;
    effort: Effort;
    deadline: string;
    assignedTo: string | null;
    estimatedMinutes: number | null;
  };
  onFormChange: (updates: Partial<TaskEditModalProps["form"]>) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  assignEmail: string;
  onAssignEmailChange: (email: string) => void;
  assignedUser: AuthMeResponse | null;
  assignError: string | null;
  onAssignLookup: () => void;
  onClearAssign: () => void;
  userDisplayName: (uid: string) => string;
  onOpenSubtasks?: (todo: Todo) => void;
  subtaskCount?: number;
  effortDefaults?: { light: number; medium: number; heavy: number };
}

export default function TaskEditModal({
  todo,
  form,
  onFormChange,
  onSave,
  onClose,
  saving,
  assignEmail,
  onAssignEmailChange,
  assignedUser,
  assignError,
  onAssignLookup,
  onClearAssign,
  userDisplayName,
  onOpenSubtasks,
  subtaskCount = 0,
  effortDefaults,
}: TaskEditModalProps) {
  const { t } = useLocale();

  useEffect(() => {
    if (!todo) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [todo, onClose]);

  if (!todo) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-edit-modal-title"
        className="bg-white dark:bg-slate-900 rounded-lg shadow-2xl border border-zinc-200 dark:border-slate-700 w-full max-w-lg mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          id="task-edit-modal-title"
          className="text-lg font-semibold text-zinc-900 dark:text-slate-100 mb-4"
        >
          {t("edit.title")}
        </h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
              {t("edit.titleField")}
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => onFormChange({ title: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSave();
                if (e.key === "Escape") onClose();
              }}
              autoFocus
              className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
                {t("edit.priority")}
              </label>
              <select
                value={form.priority}
                onChange={(e) => onFormChange({ priority: e.target.value as Priority })}
                className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400"
              >
                <option value="high">{t("priority.high")}</option>
                <option value="medium">{t("priority.medium")}</option>
                <option value="low">{t("priority.low")}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
                {t("edit.effort")}
              </label>
              <select
                value={form.effort}
                onChange={(e) => onFormChange({ effort: e.target.value as Effort })}
                className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400"
              >
                <option value="light">{t("effort.light")}</option>
                <option value="medium">{t("effort.medium")}</option>
                <option value="heavy">{t("effort.heavy")}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
                {t("edit.deadline")}
              </label>
              <input
                type="date"
                value={form.deadline}
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) => onFormChange({ deadline: e.target.value })}
                className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
              {t("todos.estimatedTime")}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={480}
                step={5}
                value={form.estimatedMinutes ?? ""}
                placeholder={String(effortDefaults?.[form.effort] ?? "")}
                onChange={(e) => {
                  const v = e.target.value;
                  onFormChange({ estimatedMinutes: v === "" ? null : Math.max(1, Math.min(480, Number(v) || 1)) });
                }}
                className="w-24 rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400 text-center"
              />
              <span className="text-xs text-zinc-400 dark:text-slate-500">{t("todos.estimatedMinutes")}</span>
              {form.estimatedMinutes !== null && (
                <button
                  type="button"
                  onClick={() => onFormChange({ estimatedMinutes: null })}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {t("todos.useDefault")}
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
              {t("assign.label")}
            </label>
            <div className="relative">
              <input
                type="email"
                placeholder={t("assign.placeholder")}
                value={assignEmail}
                onChange={(e) => onAssignEmailChange(e.target.value)}
                className={`w-full rounded border px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:outline-none focus:ring-1 ${
                  assignedUser
                    ? "border-green-400 dark:border-green-600 focus:border-green-500 focus:ring-green-500"
                    : assignError
                      ? "border-red-400 dark:border-red-600 focus:border-red-500 focus:ring-red-500"
                      : "border-zinc-300 dark:border-slate-600 focus:border-slate-700 dark:focus:border-slate-400 focus:ring-slate-700 dark:focus:ring-slate-400"
                }`}
              />
              {form.assignedTo && !assignEmail && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-zinc-500 dark:text-slate-400">
                    {t("assign.label")}: {userDisplayName(form.assignedTo)}
                  </span>
                  <button
                    type="button"
                    onClick={onClearAssign}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    ✕
                  </button>
                </div>
              )}
              {assignedUser && (
                <span className="absolute right-2 top-2.5 text-green-500">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
              )}
              {assignError && (
                <p className="text-[10px] text-red-500 mt-0.5">{assignError}</p>
              )}
            </div>
          </div>
        </div>

        {!todo.parentId && onOpenSubtasks && (
          <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-zinc-700 dark:text-slate-300">
                {t("subtask.title")}
              </h4>
              <button
                type="button"
                onClick={() => onOpenSubtasks(todo)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                {t("subtask.addShort")}
              </button>
            </div>
            {subtaskCount === 0 ? (
              <p className="text-xs text-zinc-400 dark:text-slate-500">
                {t("subtask.none")}
              </p>
            ) : (
              <p className="text-xs text-zinc-500 dark:text-slate-400">
                {subtaskCount} {t("subtask.title").toLowerCase()}
              </p>
            )}
          </div>
        )}

        <div className="flex items-center mt-5">
          {!todo.parentId && onOpenSubtasks && (
            <button
              type="button"
              onClick={() => onOpenSubtasks(todo)}
              className="flex items-center gap-1.5 rounded border border-blue-200 dark:border-blue-800 px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
              title={t("subtask.add")}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              {t("subtask.addShort")}
            </button>
          )}
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-zinc-200 dark:border-slate-600 px-4 py-2 text-sm font-medium text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
            >
              {t("edit.cancel")}
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving || !form.title.trim()}
              className="rounded bg-slate-700 dark:bg-slate-100 px-5 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-300 disabled:opacity-60 transition-colors"
            >
              {saving ? t("edit.saving") : t("edit.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
