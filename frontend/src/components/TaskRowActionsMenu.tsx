"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useLocale } from "@/lib/LocaleContext";
import type { Todo } from "@/lib/api";

export interface TaskRowActionsMenuProps {
  todo: Todo;
  meUid?: string | null;
  subtaskCount: number;
  subtasksExpanded: boolean;
  commentCount: number;
  onEdit?: (t: Todo) => void;
  onDelete: (t: Todo) => void;
  onComplete: (t: Todo) => void;
  onDecline?: (t: Todo) => void;
  onAccept?: (t: Todo) => void;
  onToggleSubtasks?: () => void;
}

export default function TaskRowActionsMenu({
  todo,
  meUid,
  subtaskCount,
  subtasksExpanded,
  commentCount,
  onEdit,
  onDelete,
  onComplete,
  onDecline,
  onAccept,
  onToggleSubtasks,
}: TaskRowActionsMenuProps) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const isActive = todo.status === "active";
  const canDecline =
    Boolean(onDecline) &&
    meUid &&
    todo.assignedTo === meUid &&
    todo.userId !== meUid &&
    todo.assignmentStatus !== "declined";
  const canAccept =
    Boolean(onAccept) &&
    meUid &&
    todo.assignedTo === meUid &&
    todo.userId !== meUid &&
    (todo.assignmentStatus === "declined" || todo.assignmentStatus === "pending");

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        className="w-8 h-8 rounded flex items-center justify-center text-zinc-400 dark:text-slate-500 hover:bg-zinc-100 dark:hover:bg-slate-800 hover:text-zinc-700 dark:hover:text-slate-200 transition-colors"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        title={t("task.actions.openMenu")}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <span className="sr-only">{t("task.actions.openMenu")}</span>
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path d="M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
        </svg>
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-full mt-1 w-56 py-1 rounded-lg border border-zinc-200 dark:border-slate-600 bg-white dark:bg-slate-900 shadow-xl z-[60]"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-slate-500">
            {t("task.actions.heading")}
          </p>
          {!isActive ? (
            <>
              <button
                type="button"
                role="menuitem"
                className="w-full text-left px-3 py-2 text-sm text-zinc-800 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-800"
                onClick={() => {
                  close();
                  onComplete(todo);
                }}
              >
                {t("todos.reactivate")}
              </button>
              <button
                type="button"
                role="menuitem"
                className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                onClick={() => {
                  close();
                  onDelete(todo);
                }}
              >
                {t("a11y.delete")}
              </button>
            </>
          ) : (
            <>
              {onEdit && (
                <button
                  type="button"
                  role="menuitem"
                  className="w-full text-left px-3 py-2 text-sm text-zinc-800 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-800"
                  onClick={() => {
                    close();
                    onEdit(todo);
                  }}
                >
                  {t("task.actions.editDetails")}
                </button>
              )}
              {onEdit && (
                <button
                  type="button"
                  role="menuitem"
                  className="w-full text-left px-3 py-2 text-sm text-zinc-800 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-800"
                  onClick={() => {
                    close();
                    onEdit(todo);
                  }}
                >
                  {commentCount > 0
                    ? `${t("task.actions.comments")} (${commentCount})`
                    : t("task.actions.comments")}
                </button>
              )}
              {subtaskCount > 0 && onToggleSubtasks && (
                <button
                  type="button"
                  role="menuitem"
                  className="w-full text-left px-3 py-2 text-sm text-zinc-800 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-800"
                  onClick={() => {
                    close();
                    onToggleSubtasks();
                  }}
                >
                  {subtasksExpanded ? t("task.actions.subtasksCollapse") : t("task.actions.subtasksExpand")}
                </button>
              )}
              {canDecline && onDecline && (
                <button
                  type="button"
                  role="menuitem"
                  className="w-full text-left px-3 py-2 text-sm text-orange-700 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/20"
                  onClick={() => {
                    close();
                    onDecline(todo);
                  }}
                >
                  {t("assign.decline")}
                </button>
              )}
              {canAccept && onAccept && (
                <button
                  type="button"
                  role="menuitem"
                  className="w-full text-left px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                  onClick={() => {
                    close();
                    onAccept(todo);
                  }}
                >
                  {t("assign.accept")}
                </button>
              )}
              <div className="my-1 border-t border-zinc-100 dark:border-slate-800" />
              <button
                type="button"
                role="menuitem"
                className="w-full text-left px-3 py-2 text-sm text-zinc-800 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-800"
                onClick={() => {
                  close();
                  onComplete(todo);
                }}
              >
                {t("task.actions.markDone")}
              </button>
              <button
                type="button"
                role="menuitem"
                className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                onClick={() => {
                  close();
                  onDelete(todo);
                }}
              >
                {t("a11y.delete")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
