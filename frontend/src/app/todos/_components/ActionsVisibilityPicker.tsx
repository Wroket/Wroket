"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "@/lib/LocaleContext";
import type { TranslationKey } from "@/lib/i18n";
import {
  TASK_LIST_ACTION_IDS,
  type TaskListActionId,
} from "@/lib/taskListVisibleActions";

const ACTION_LABEL_KEYS: Record<TaskListActionId, TranslationKey> = {
  schedule: "table.visibleAction.schedule",
  meet: "table.visibleAction.meet",
  comment: "table.visibleAction.comment",
  note: "table.visibleAction.note",
  subtask: "table.visibleAction.subtask",
  attach: "table.visibleAction.attach",
  cancel: "table.visibleAction.cancel",
  delete: "table.visibleAction.delete",
};

interface ActionsVisibilityPickerProps {
  visible: TaskListActionId[];
  onChange: (next: TaskListActionId[]) => void;
}

/**
 * Compact checklist (Actions column header) to pin row action icons.
 */
export default function ActionsVisibilityPicker({
  visible,
  onChange,
}: ActionsVisibilityPickerProps) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    const update = () => {
      const btn = rootRef.current?.querySelector("button");
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const width = panelRef.current?.offsetWidth ?? 220;
      const pad = 8;
      let left = r.left;
      left = Math.max(pad, Math.min(left, window.innerWidth - width - pad));
      setCoords({ top: r.bottom + 4, left });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (id: TaskListActionId) => {
    const set = new Set(visible);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChange(TASK_LIST_ACTION_IDS.filter((x) => set.has(x)));
  };

  return (
    <div ref={rootRef} className="relative inline-flex shrink-0">
      <button
        type="button"
        data-testid="task-actions-visibility"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex items-center justify-center w-5 h-5 rounded text-zinc-400 dark:text-slate-500 hover:text-zinc-700 dark:hover:text-slate-200 hover:bg-zinc-100 dark:hover:bg-slate-800 transition-colors"
        title={t("table.visibleActionsHint")}
        aria-label={t("table.visibleActionsHint")}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
      {open && coords && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={t("table.visibleActionsTitle")}
            style={{ top: coords.top, left: coords.left }}
            className="fixed z-[200] w-56 rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-2 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-slate-500">
              {t("table.visibleActionsTitle")}
            </p>
            <p className="px-3 pb-2 text-[11px] text-zinc-500 dark:text-slate-400 leading-snug">
              {t("table.visibleActionsHelp")}
            </p>
            <ul className="max-h-64 overflow-y-auto">
              {TASK_LIST_ACTION_IDS.map((id) => {
                const checked = visible.includes(id);
                return (
                  <li key={id}>
                    <label className="flex items-center gap-2.5 px-3 py-1.5 text-sm text-zinc-700 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(id)}
                        className="rounded border-zinc-300 dark:border-slate-600 text-emerald-600 focus:ring-emerald-500 dark:bg-slate-800"
                      />
                      <span className="min-w-0 truncate">{t(ACTION_LABEL_KEYS[id])}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className="px-3 pt-2 text-[10px] text-zinc-400 dark:text-slate-500 leading-snug border-t border-zinc-100 dark:border-slate-800 mt-1">
              {t("table.visibleActionsMoreAlways")}
            </p>
          </div>,
          document.body,
        )}
    </div>
  );
}
