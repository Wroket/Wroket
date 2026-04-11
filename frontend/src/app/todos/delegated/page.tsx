"use client";

import { useEffect, useMemo, useState } from "react";

import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthContext";
import DeleteTaskDialog from "@/components/DeleteTaskDialog";
import {
  getTodos,
  updateTodo,
  deleteTodo,
  Todo,
  TodoStatus,
} from "@/lib/api";
import { displayTodoTitle } from "@/lib/todoDisplay";
import { useLocale } from "@/lib/LocaleContext";
import { useUserLookup } from "@/lib/userUtils";

export default function DelegatedPage() {
  const { t } = useLocale();
  const { user } = useAuth();
  const { resolveUser, displayName } = useUserLookup();
  const [allTodos, setAllTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<Todo | null>(null);

  const todos = useMemo(
    () => allTodos.filter((todo) => todo.assignedTo && user && todo.assignedTo !== user.uid && !todo.parentId),
    [allTodos, user],
  );

  const subtasksByParent = useMemo(() => {
    const map: Record<string, Todo[]> = {};
    for (const td of allTodos) {
      if (td.parentId) (map[td.parentId] ??= []).push(td);
    }
    return map;
  }, [allTodos]);

  const getSubtasks = (parentId: string) => subtasksByParent[parentId] ?? [];

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const fetched = await getTodos();
        if (cancelled) return;
        setAllTodos(fetched);

        const delegated = fetched.filter((todo) => todo.assignedTo && todo.assignedTo !== user.uid && !todo.parentId);
        const uids = new Set<string>();
        delegated.forEach((todo) => { if (todo.assignedTo) uids.add(todo.assignedTo); });
        uids.forEach((uid) => resolveUser(uid));
      } catch { /* auth handled by AppShell */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [user, resolveUser]);

  const handleStatusChange = async (todo: Todo, newStatus: TodoStatus) => {
    try {
      const updated = await updateTodo(todo.id, { status: newStatus });
      setAllTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch { /* noop */ }
  };

  const requestDelete = (todo: Todo) => {
    if (todo.status === "deleted") {
      executeDelete(todo, "promote");
    } else {
      setConfirmDelete(todo);
    }
  };

  const executeDelete = async (todo: Todo, mode: "promote" | "deleteAll") => {
    setConfirmDelete(null);
    try {
      if (todo.status === "deleted") {
        const restored = await updateTodo(todo.id, { status: "active" });
        setAllTodos((prev) => prev.map((t) => (t.id === restored.id ? restored : t)));
      } else {
        const subs = getSubtasks(todo.id);
        if (subs.length > 0) {
          if (mode === "promote") {
            const promoted = await Promise.all(subs.map((s) => updateTodo(s.id, { parentId: null })));
            setAllTodos((prev) => prev.map((t) => {
              const p = promoted.find((u) => u.id === t.id);
              return p ?? t;
            }));
          } else {
            const deleted = await Promise.all(subs.map((s) => deleteTodo(s.id)));
            setAllTodos((prev) => prev.map((t) => {
              const d = deleted.find((u) => u.id === t.id);
              return d ?? t;
            }));
          }
        }
        const updated = await deleteTodo(todo.id);
        setAllTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      }
    } catch { /* noop */ }
  };

  const statusBadge = (status: TodoStatus) => {
    switch (status) {
      case "active": return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
      case "completed": return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300";
      case "cancelled": return "bg-zinc-200 text-zinc-600 dark:bg-slate-700 dark:text-slate-400";
      case "deleted": return "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300";
      default: return "bg-zinc-100 text-zinc-600";
    }
  };

  const statusLabel = (status: TodoStatus) => {
    switch (status) {
      case "active": return t("filter.doFirst");
      case "completed": return t("filter.completed");
      case "cancelled": return t("filter.cancelled");
      case "deleted": return t("filter.deleted");
      default: return status;
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[300px]">
          <span className="text-zinc-400 dark:text-slate-500 text-sm">{t("loading")}</span>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto space-y-6">
        <div>
          <h2 className="text-base font-semibold text-zinc-700 dark:text-slate-300 tracking-wide uppercase">
            {t("todos.delegatedTitle")}
          </h2>
          <p className="text-sm text-zinc-400 dark:text-slate-500 mt-1">
            {t("todos.delegatedDesc")}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-md shadow-sm border border-zinc-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-slate-700 bg-zinc-50/80 dark:bg-slate-800/80">
                <th className="text-left px-4 py-3 font-semibold text-zinc-600 dark:text-slate-400">{t("table.title")}</th>
                <th className="text-left px-4 py-3 font-semibold text-zinc-600 dark:text-slate-400 w-40">{t("assign.assignedTo")}</th>
                <th className="text-left px-4 py-3 font-semibold text-zinc-600 dark:text-slate-400 w-28">{t("table.priority")}</th>
                <th className="text-left px-4 py-3 font-semibold text-zinc-600 dark:text-slate-400 w-28">{t("table.status")}</th>
                <th className="text-left px-4 py-3 font-semibold text-zinc-600 dark:text-slate-400 w-36">{t("table.deadline")}</th>
                <th className="w-20 px-4 py-3 text-left font-semibold text-zinc-600 dark:text-slate-400 text-xs">{t("table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {todos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-zinc-400 italic">
                    {t("todos.delegatedEmpty")}
                  </td>
                </tr>
              ) : (
                todos.map((todo) => {
                  const isArchived = todo.status !== "active";
                  return (
                    <tr
                      key={todo.id}
                      className={`border-b border-zinc-100 dark:border-slate-800 last:border-b-0 hover:bg-zinc-50/60 dark:hover:bg-slate-800/60 transition-colors ${isArchived ? "opacity-50" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <span className={`font-medium ${
                          todo.status === "completed" ? "line-through text-zinc-400" :
                          todo.status === "cancelled" ? "line-through text-zinc-400 italic" :
                          todo.status === "deleted" ? "line-through text-zinc-300 dark:text-slate-600" :
                          "text-zinc-900 dark:text-slate-100"
                        }`}>
                          {displayTodoTitle(todo.title, t("todos.untitled"))}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {todo.assignedTo && (
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-cyan-700 dark:text-cyan-300">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                              {displayName(todo.assignedTo)}
                            </span>
                            {todo.assignmentStatus === "declined" && (
                              <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
                                {t("assign.declined")}
                              </span>
                            )}
                            {todo.assignmentStatus === "accepted" && (
                              <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                {t("assign.accepted")}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${
                          todo.priority === "high" ? "bg-red-500 text-white" :
                          todo.priority === "medium" ? "bg-amber-500 text-white" :
                          "bg-emerald-400 text-white"
                        }`}>
                          {todo.priority === "high" ? t("priority.high") : todo.priority === "medium" ? t("priority.medium") : t("priority.low")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${statusBadge(todo.status)}`}>
                          {statusLabel(todo.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {todo.deadline ? (
                          <span className="text-xs text-zinc-600 dark:text-slate-300">
                            {new Date(todo.deadline).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isArchived ? (
                          <button
                            onClick={() => handleStatusChange(todo, "active")}
                            title={t("todos.reactivate")}
                            className="inline-flex items-center gap-1 rounded border border-green-300 dark:border-green-700 px-2 py-1 text-[11px] font-medium text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/40 transition-colors"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
                            </svg>
                          </button>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleStatusChange(todo, "completed")}
                              title={t("filter.completed")}
                              className="w-6 h-6 rounded flex items-center justify-center border border-zinc-300 text-zinc-400 hover:border-green-500 hover:text-green-500 transition-colors"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </button>
                            <button
                              onClick={() => requestDelete(todo)}
                              title={t("filter.deleted")}
                              className="w-6 h-6 rounded flex items-center justify-center border border-transparent text-zinc-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <DeleteTaskDialog
        open={!!confirmDelete}
        taskTitle={confirmDelete?.title ?? ""}
        subtaskCount={confirmDelete ? getSubtasks(confirmDelete.id).length : 0}
        onCancel={() => setConfirmDelete(null)}
        onDeleteAndPromote={() => confirmDelete && executeDelete(confirmDelete, "promote")}
        onDeleteAll={() => confirmDelete && executeDelete(confirmDelete, "deleteAll")}
      />
    </AppShell>
  );
}
