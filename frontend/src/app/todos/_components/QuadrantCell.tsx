"use client";

import { useMemo, useState } from "react";

import TodoCard from "@/components/TodoCard";
import { useLocale } from "@/lib/LocaleContext";
import { QUADRANT_CONFIG, type Quadrant } from "@/lib/todoConstants";
import type { Todo, Project } from "@/lib/api";

export interface QuadrantCellProps {
  quadrant: Quadrant;
  todos: Todo[];
  allTodos?: Todo[];
  onComplete: (t: Todo) => void;
  onDelete: (t: Todo) => void;
  onDecline?: (t: Todo) => void;
  onAccept?: (t: Todo) => void;
  onEdit?: (t: Todo) => void;
  onScheduleUpdate?: (t: Todo) => void;
  subtaskCounts?: Record<string, number>;
  commentCounts?: Record<string, number>;
  meUid?: string | null;
  userDisplayName?: (uid: string) => string;
  projects?: Project[];
}

export default function QuadrantCell({
  quadrant,
  todos,
  allTodos = [],
  onComplete,
  onDelete,
  onDecline,
  onAccept,
  onEdit,
  onScheduleUpdate,
  subtaskCounts = {},
  commentCounts: ccounts = {},
  meUid,
  userDisplayName,
  projects = [],
}: QuadrantCellProps) {
  const { t } = useLocale();
  const cfg = QUADRANT_CONFIG[quadrant];
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const LIMIT = 5;
  const visible = showAll ? todos : todos.slice(0, LIMIT);
  const hasMore = todos.length > LIMIT;

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const childrenMap = useMemo(() => {
    const map: Record<string, Todo[]> = {};
    for (const td of allTodos) {
      if (td.parentId) (map[td.parentId] ??= []).push(td);
    }
    return map;
  }, [allTodos]);
  const subtasksOf = (id: string) => childrenMap[id] ?? [];

  return (
    <div className={`${cfg.cellBg} flex flex-col min-h-[220px] h-full`}>
      <div className={`${cfg.headerBg} px-4 py-2 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span>{cfg.icon}</span>
          <span className={`text-xs font-bold ${cfg.headerText} tracking-wide uppercase`}>
            {t(cfg.tKey)}
          </span>
        </div>
        {todos.length > 0 && (
          <span className={`${cfg.headerText} text-[10px] font-bold bg-white/20 rounded-full w-5 h-5 flex items-center justify-center`}>
            {todos.length}
          </span>
        )}
      </div>
      <div className="p-3 flex-1">
        {todos.length === 0 ? (
          <div className="h-full flex items-center justify-center min-h-[140px]">
            <p className="text-xs text-zinc-400 italic">{t("matrix.empty")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((todo) => {
              const sc = subtaskCounts[todo.id] ?? 0;
              const subs = expanded.has(todo.id) ? subtasksOf(todo.id) : [];
              return (
                <div key={todo.id}>
                  <TodoCard todo={todo} onComplete={onComplete} onDelete={onDelete} onDecline={onDecline} onAccept={onAccept} onEdit={onEdit} onScheduleUpdate={onScheduleUpdate} subtaskCount={sc} onToggleSubtasks={sc > 0 ? () => toggleExpand(todo.id) : undefined} subtasksExpanded={expanded.has(todo.id)} meUid={meUid} userDisplayName={userDisplayName} commentCount={ccounts[todo.id] ?? 0} projects={projects} />
                  {subs.length > 0 && (
                    <div className="ml-5 mt-1 space-y-1">
                      {subs.map((sub) => (
                        <div key={sub.id} className="flex items-center gap-2 rounded bg-zinc-50/60 dark:bg-slate-800/40 px-2 py-1.5 text-xs">
                          <button
                            onClick={() => onComplete(sub)}
                            className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                              sub.status === "completed"
                                ? "bg-green-500 border-green-500 text-white"
                                : "border-zinc-300 dark:border-slate-500 text-zinc-400 hover:border-green-500 hover:text-green-500"
                            } transition-colors`}
                          >
                            <svg className="w-2 h-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </button>
                          <span className="text-zinc-400 text-[10px]">↳</span>
                          <span className={`flex-1 truncate ${sub.status === "completed" ? "line-through text-zinc-400" : "text-zinc-700 dark:text-slate-300"}`}>{sub.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {hasMore && (
              <button
                type="button"
                onClick={() => setShowAll(!showAll)}
                className="w-full text-center text-[11px] font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-slate-300 py-1 transition-colors"
              >
                {showAll ? t("matrix.showLess") : `${t("matrix.showMore")} (${todos.length - LIMIT})`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
