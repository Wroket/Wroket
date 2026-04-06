"use client";

import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/AuthContext";
import { useToast } from "@/components/Toast";
import { getArchivedTodos, updateTodo, type Todo, type TodoStatus } from "@/lib/api";
import { deadlineLabel } from "@/lib/deadlineUtils";
import { EFFORT_BADGES } from "@/lib/effortBadges";
import { useLocale } from "@/lib/LocaleContext";
import { PRIORITY_BADGES } from "@/lib/todoConstants";
import { useUserLookup } from "@/lib/userUtils";

const STATUS_STYLES: Record<string, { tKey: string; cls: string }> = {
  completed: { tKey: "archives.completedOn", cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  cancelled: { tKey: "archives.cancelledOn", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  deleted: { tKey: "archives.deletedOn", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
};

export default function ArchivedTasksPanel() {
  const { t } = useLocale();
  const { user } = useAuth();
  const { toast } = useToast();
  const { resolveUser, displayName } = useUserLookup();
  const meUid = user?.uid ?? null;

  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [taskFilter, setTaskFilter] = useState<TodoStatus | "all">("all");

  useEffect(() => {
    let cancelled = false;
    getArchivedTodos()
      .then((data) => {
        if (!cancelled) setTodos(data);
      })
      .catch(() => toast.error(t("toast.loadError")))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [toast, t]);

  useEffect(() => {
    const uids = new Set<string>();
    for (const td of todos) {
      if (td.assignedTo) uids.add(td.assignedTo);
      if (td.userId) uids.add(td.userId);
    }
    uids.forEach((uid) => resolveUser(uid));
  }, [todos, resolveUser]);

  const filteredTasks = useMemo(() => {
    const list = taskFilter === "all" ? todos : todos.filter((td) => td.status === taskFilter);
    return list.filter((td) => !td.parentId);
  }, [todos, taskFilter]);

  const taskCounts = useMemo(() => {
    const c = { all: 0, completed: 0, cancelled: 0, deleted: 0 };
    for (const td of todos) {
      if (td.parentId) continue;
      c.all++;
      if (td.status === "completed") c.completed++;
      else if (td.status === "cancelled") c.cancelled++;
      else if (td.status === "deleted") c.deleted++;
    }
    return c;
  }, [todos]);

  const restoreTask = async (todo: Todo) => {
    try {
      const updated = await updateTodo(todo.id, { status: "active" });
      setTodos((prev) => prev.filter((td) => td.id !== updated.id));
      toast.success(t("toast.taskRestored"));
    } catch {
      toast.error(t("toast.restoreError"));
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-slate-100">{t("archives.tasks")}</h1>
        <p className="text-sm text-zinc-500 dark:text-slate-400 mt-1">{t("archives.subtitle")}</p>
        <p className="text-xs text-zinc-500 dark:text-slate-500 mt-3 leading-relaxed border-l-2 border-zinc-200 dark:border-slate-600 pl-3">
          {t("archives.tasksPrivacy")}
        </p>
      </div>

      <div className="flex items-center gap-1 bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-1">
        {(["all", "completed", "cancelled", "deleted"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTaskFilter(key)}
            className={`flex-1 rounded px-3 py-2 text-sm font-medium transition-colors ${
              taskFilter === key
                ? "bg-slate-700 dark:bg-slate-600 text-white dark:text-slate-100"
                : "text-zinc-500 dark:text-slate-400 hover:text-zinc-700 dark:hover:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-800"
            }`}
          >
            {key === "all" ? t("scope.all") : t(`filter.${key}`)}
            <span className="ml-1.5 text-[10px] font-semibold opacity-70">{taskCounts[key]}</span>
          </button>
        ))}
      </div>

      {filteredTasks.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-10 text-center">
          <svg className="w-10 h-10 mx-auto text-zinc-300 dark:text-slate-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8" />
          </svg>
          <p className="text-sm text-zinc-400 dark:text-slate-500 italic">{t("archives.empty")}</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-slate-800 text-xs text-zinc-500 dark:text-slate-400 uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-medium">{t("table.title")}</th>
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">{t("table.priority")}</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">{t("table.status")}</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">{t("archives.statusDateColumn")}</th>
                <th className="text-right px-4 py-3 font-medium w-24" />
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map((todo) => {
                const dl = deadlineLabel(todo.deadline, t);
                const statusInfo = STATUS_STYLES[todo.status] ?? STATUS_STYLES.deleted;
                const subtasks = todos.filter((td) => td.parentId === todo.id);

                return (
                  <tr key={todo.id} className="border-b border-zinc-50 dark:border-slate-800/50 last:border-0 hover:bg-zinc-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-600 dark:text-slate-300 line-through opacity-70">{todo.title}</span>
                        {subtasks.length > 0 && (
                          <span className="text-[9px] font-medium text-blue-500 bg-blue-50 dark:bg-blue-950/40 px-1 py-0.5 rounded">
                            {subtasks.length} ↳
                          </span>
                        )}
                        {todo.assignedTo && meUid && todo.assignedTo !== meUid && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300 hidden sm:inline">
                            → {displayName(todo.assignedTo)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="flex items-center gap-1">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${PRIORITY_BADGES[todo.priority].cls}`}>
                          {t(`priority.${todo.priority}`)}
                        </span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${EFFORT_BADGES[todo.effort ?? "medium"].cls}`}>
                          {t(EFFORT_BADGES[todo.effort ?? "medium"].tKey)}
                        </span>
                        {dl && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${dl.cls}`}>{dl.text}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${statusInfo.cls}`}>{t(statusInfo.tKey)}</span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs text-zinc-400 dark:text-slate-500">{formatDate(todo.statusChangedAt)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => restoreTask(todo)}
                        className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
                      >
                        {t("archives.restore")}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
