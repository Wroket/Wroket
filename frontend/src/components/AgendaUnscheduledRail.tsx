"use client";

import { useMemo, useState } from "react";
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

function isUnscheduledActive(td: Todo, meUid: string | null): boolean {
  return (
    td.status === "active" &&
    !td.scheduledSlot?.start &&
    (!meUid || td.userId === meUid)
  );
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
 * Root tasks only in the main list; unscheduled subtasks via badge + light expand.
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
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const unscheduledSubsByParent = useMemo(() => {
    const map = new Map<string, Todo[]>();
    for (const td of todos) {
      if (!td.parentId || !isUnscheduledActive(td, meUid)) continue;
      const list = map.get(td.parentId) ?? [];
      list.push(td);
      map.set(td.parentId, list);
    }
    for (const [pid, list] of map) {
      map.set(pid, sortUnscheduledTodos(list));
    }
    return map;
  }, [todos, meUid]);

  const unscheduled = useMemo(() => {
    const list = todos.filter((td) => !td.parentId && isUnscheduledActive(td, meUid));
    return sortUnscheduledTodos(list).slice(0, 40);
  }, [todos, meUid]);

  const focusTodo = scheduleFocusId
    ? todos.find((td) => td.id === scheduleFocusId) ?? null
    : null;

  if (unscheduled.length === 0 && !focusTodo) return null;

  const toggleExpand = (parentId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  };

  const subtasksLabel = (n: number) =>
    t("agenda.unscheduledSubtasks")
      .replace("{{n}}", String(n))
      .replace("{{s}}", n > 1 ? "s" : "");

  return (
    <aside
      className="w-full lg:w-64 shrink-0 border border-zinc-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 flex flex-col max-h-[42vh] lg:max-h-none lg:h-full overflow-hidden"
      aria-label={t("agenda.unscheduledRailTitle")}
    >
      <div className="px-3 py-2 border-b border-zinc-100 dark:border-slate-800">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-slate-400">
          {t("agenda.unscheduledRailTitle")}
        </h2>
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
        {unscheduled
          .filter((td) => td.id !== scheduleFocusId)
          .map((td) => {
          const subs = (unscheduledSubsByParent.get(td.id) ?? []).filter(
            (sub) => sub.id !== scheduleFocusId,
          );
          const expanded = expandedIds.has(td.id);
          const showExpand = (unscheduledSubsByParent.get(td.id) ?? []).length > 0;
          return (
            <li key={td.id}>
              <div className="flex items-stretch">
                {showExpand && (
                  <button
                    type="button"
                    onClick={() => toggleExpand(td.id)}
                    className="px-1.5 shrink-0 text-zinc-400 hover:text-zinc-700 dark:hover:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-800/80 transition-colors"
                    aria-expanded={expanded}
                    aria-label={
                      expanded ? t("agenda.unscheduledCollapseSubs") : t("agenda.unscheduledExpandSubs")
                    }
                  >
                    <svg
                      className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onSelect(td.id)}
                  className={`flex-1 min-w-0 text-left px-3 py-2.5 transition-colors hover:bg-zinc-50 dark:hover:bg-slate-800/80 ${
                    showExpand ? "pl-1" : ""
                  }`}
                >
                  <p className="text-xs font-medium text-zinc-800 dark:text-slate-100 line-clamp-2">
                    {displayTodoTitle(td.title, untitled)}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
                      {t("agenda.unscheduledPlace")}
                    </span>
                    {showExpand && (
                      <span className="text-[10px] font-medium text-zinc-500 dark:text-slate-400 tabular-nums">
                        {subtasksLabel((unscheduledSubsByParent.get(td.id) ?? []).length)}
                      </span>
                    )}
                  </div>
                </button>
              </div>
              {expanded && showExpand && (
                <ul className="border-t border-zinc-50 dark:border-slate-800/80 bg-zinc-50/50 dark:bg-slate-950/30">
                  {subs.map((sub) => (
                      <li key={sub.id}>
                        <button
                          type="button"
                          onClick={() => onSelect(sub.id)}
                          className="w-full text-left pl-8 pr-3 py-2 transition-colors hover:bg-zinc-100/80 dark:hover:bg-slate-800/60"
                        >
                          <p className="text-[11px] font-medium text-zinc-700 dark:text-slate-200 line-clamp-2">
                            {displayTodoTitle(sub.title, untitled)}
                          </p>
                          <p className="mt-0.5 text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
                            {t("agenda.unscheduledPlace")}
                          </p>
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </li>
          );
        })}
        {unscheduled.filter((td) => td.id !== scheduleFocusId).length === 0 && !focusTodo && (
          <li className="px-3 py-4 text-xs text-zinc-400 dark:text-slate-500 text-center">
            {t("agenda.unscheduledEmpty")}
          </li>
        )}
      </ul>
    </aside>
  );
}
