"use client";

import type { MoveTodoStrategy } from "@/lib/api/todos";
import type { TranslationKey } from "./types";

export type TaskMoveModalVariant = "light" | "dates";

export type TaskMoveModalState =
  | {
      variant: TaskMoveModalVariant;
      code: "TASK_PHASE_DATE_MISMATCH" | "TASK_PHASE_SLOT_MISMATCH";
      phaseStart?: string | null;
      phaseEnd?: string | null;
      onResolve: (strategy: MoveTodoStrategy) => void;
    }
  | {
      variant: "conflict";
      conflicts: Array<{ id: string; title: string }>;
      onResolve: (force: boolean) => void;
    };

interface TaskMoveConstraintModalProps {
  state: TaskMoveModalState | null;
  onClose: () => void;
  t: (key: TranslationKey) => string;
}

export default function TaskMoveConstraintModal({ state, onClose, t }: TaskMoveConstraintModalProps) {
  if (!state) return null;

  if (state.variant === "conflict") {
    return (
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-move-conflict-title"
      >
        <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-4 shadow-xl dark:border-slate-600 dark:bg-slate-900">
          <h2 id="task-move-conflict-title" className="text-sm font-semibold text-zinc-900 dark:text-slate-100">
            {t("schedule.conflictTitle")}
          </h2>
          <ul className="mt-2 max-h-40 overflow-y-auto text-xs text-zinc-600 dark:text-slate-300 space-y-1">
            {state.conflicts.map((c) => (
              <li key={c.id} className="truncate">{c.title}</li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-slate-600"
              onClick={onClose}
            >
              {t("schedule.conflictCancel")}
            </button>
            <button
              type="button"
              className="rounded-md bg-slate-800 px-3 py-1.5 text-sm text-white dark:bg-slate-600"
              onClick={() => state.onResolve(true)}
            >
              {t("schedule.conflictForce")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isSlot = state.code === "TASK_PHASE_SLOT_MISMATCH";

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-move-constraint-title"
    >
      <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-4 shadow-xl dark:border-slate-600 dark:bg-slate-900">
        <h2 id="task-move-constraint-title" className="text-sm font-semibold text-zinc-900 dark:text-slate-100">
          {isSlot ? t("projects.moveConstraint.slotTitle") : t("projects.moveConstraint.dateTitle")}
        </h2>
        <p className="mt-2 text-xs text-zinc-600 dark:text-slate-300">
          {isSlot ? t("projects.moveConstraint.slotBody") : t("projects.moveConstraint.dateBody")}
        </p>
        {(state.phaseStart || state.phaseEnd) && (
          <p className="mt-1 text-xs text-zinc-500 dark:text-slate-400">
            {state.phaseStart && state.phaseEnd
              ? `${state.phaseStart} → ${state.phaseEnd}`
              : state.phaseStart ?? state.phaseEnd}
          </p>
        )}
        <div className="mt-4 flex flex-col gap-2">
          {!isSlot && (
            <button
              type="button"
              className="rounded-md bg-slate-800 px-3 py-2 text-sm text-white dark:bg-slate-600 text-left"
              onClick={() => state.onResolve("clampDatesToPhase")}
            >
              {t("projects.moveConstraint.clampDates")}
            </button>
          )}
          {isSlot && (
            <button
              type="button"
              className="rounded-md bg-slate-800 px-3 py-2 text-sm text-white dark:bg-slate-600 text-left"
              onClick={() => state.onResolve("clearScheduledSlot")}
            >
              {t("projects.moveConstraint.clearSlot")}
            </button>
          )}
          {!isSlot && (
            <button
              type="button"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-slate-600 text-left"
              onClick={() => state.onResolve("clearScheduledSlot")}
            >
              {t("projects.moveConstraint.clearSlotAndMove")}
            </button>
          )}
          <button
            type="button"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-slate-600"
            onClick={onClose}
          >
            {t("cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
