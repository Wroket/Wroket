"use client";

import { useMemo } from "react";
import type { Todo, Priority } from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import { displayTodoTitle } from "@/lib/todoDisplay";
import SlotPicker from "@/components/SlotPicker";
import { isEffectivelyOverdue } from "@/lib/effectiveDue";

function priorityRank(p: Priority): number {
  if (p === "high") return 0;
  if (p === "medium") return 1;
  return 2;
}

export function sortUnscheduledTodos(todos: Todo[]): Todo[] {
  return [...todos].sort((a, b) => {
    const overdueA = isEffectivelyOverdue(a) ? 0 : 1;
    const overdueB = isEffectivelyOverdue(b) ? 0 : 1;
    if (overdueA !== overdueB) return overdueA - overdueB;
    const pr = priorityRank(a.priority) - priorityRank(b.priority);
    if (pr !== 0) return pr;
    const da = a.deadline?.trim() || "9999";
    const db = b.deadline?.trim() || "9999";
    return da.localeCompare(db);
  });
}

interface AgendaUnscheduledRailProps {
  todos: Todo[];
  meUid: string | null;
  scheduleFocusId: string | null;
  onSelect: (todoId: string) => void;
  onBooked: (todo: Todo) => void;
  onCleared: (todo: Todo) => void;
  onCloseFocus: () => void;
}

/**
 * Side rail of active tasks without a booked slot — click to open SlotPicker (Path to 9 A3).
 */
export default function AgendaUnscheduledRail({
  todos,
  meUid,
  scheduleFocusId,
  onSelect,
  onBooked,
  onCleared,
  onCloseFocus,
}: AgendaUnscheduledRailProps) {
  const { t } = useLocale();
  const untitled = t("todos.untitled");

  const unscheduled = useMemo(() => {
    const list = todos.filter(
      (td) =>
        td.status === "active" &&
        !td.parentId &&
        !td.scheduledSlot?.start &&
        (!meUid || td.userId === meUid),
    );
    return sortUnscheduledTodos(list).slice(0, 40);
  }, [todos, meUid]);

  const focusTodo = scheduleFocusId
    ? todos.find((td) => td.id === scheduleFocusId) ?? null
    : null;

  if (unscheduled.length === 0 && !focusTodo) return null;

  return (
    <aside
      className="w-full lg:w-64 shrink-0 border border-zinc-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 flex flex-col max-h-[42vh] lg:max-h-none lg:h-full overflow-hidden"
      aria-label={t("agenda.unscheduledRailTitle")}
    >
      <div className="px-3 py-2 border-b border-zinc-100 dark:border-slate-800">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-slate-400">
          {t("agenda.unscheduledRailTitle")}
        </h2>
        <p className="text-[11px] text-zinc-400 dark:text-slate-500 mt-0.5">
          {t("agenda.unscheduledRailHint")}
        </p>
      </div>

      {focusTodo && (
        <div className="px-3 py-2 border-b border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/80 dark:bg-emerald-950/20 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium text-zinc-800 dark:text-slate-100 line-clamp-2">
              {displayTodoTitle(focusTodo.title, untitled)}
            </p>
            <button
              type="button"
              onClick={onCloseFocus}
              className="text-[10px] font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-slate-200 shrink-0"
            >
              {t("edit.cancel")}
            </button>
          </div>
          <SlotPicker
            todoId={focusTodo.id}
            scheduledSlot={focusTodo.scheduledSlot ?? null}
            suggestedSlot={focusTodo.suggestedSlot}
            onBooked={(todo) => {
              onBooked(todo);
              onCloseFocus();
            }}
            onCleared={onCleared}
            autoOpen
            dateMin={focusTodo.startDate ?? undefined}
            dateMax={focusTodo.deadline ?? undefined}
          />
        </div>
      )}

      <ul className="flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-slate-800">
        {unscheduled.map((td) => {
          const active = td.id === scheduleFocusId;
          return (
            <li key={td.id}>
              <button
                type="button"
                onClick={() => onSelect(td.id)}
                className={`w-full text-left px-3 py-2.5 transition-colors ${
                  active
                    ? "bg-emerald-50 dark:bg-emerald-950/30"
                    : "hover:bg-zinc-50 dark:hover:bg-slate-800/80"
                }`}
              >
                <p className="text-xs font-medium text-zinc-800 dark:text-slate-100 line-clamp-2">
                  {displayTodoTitle(td.title, untitled)}
                </p>
                <p className="mt-1 text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
                  {t("agenda.unscheduledPlace")}
                </p>
              </button>
            </li>
          );
        })}
        {unscheduled.length === 0 && (
          <li className="px-3 py-4 text-xs text-zinc-400 dark:text-slate-500 text-center">
            {t("agenda.unscheduledEmpty")}
          </li>
        )}
      </ul>
    </aside>
  );
}
