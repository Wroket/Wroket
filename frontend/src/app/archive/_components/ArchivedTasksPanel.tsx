"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/components/AuthContext";
import ConfirmDialog from "@/components/ConfirmDialog";
import ExportImportDropdown from "@/components/ExportImportDropdown";
import TaskImportModal from "@/components/TaskImportModal";
import { useToast } from "@/components/Toast";
import {
  deleteArchivedTodoPermanently,
  exportTasks,
  getArchivedTodos,
  purgeAllArchivedTodos,
  updateTodo,
  type Priority,
  type Todo,
  type TodoStatus,
} from "@/lib/api";
import { deadlineLabel } from "@/lib/deadlineUtils";
import { EFFORT_BADGES } from "@/lib/effortBadges";
import { displayTodoTitle } from "@/lib/todoDisplay";
import { useLocale } from "@/lib/LocaleContext";
import { PRIORITY_BADGES } from "@/lib/todoConstants";
import { useUserLookup } from "@/lib/userUtils";

const STATUS_STYLES: Record<string, { tKey: string; cls: string }> = {
  completed: { tKey: "archives.completedOn", cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  cancelled: { tKey: "archives.cancelledOn", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  deleted: { tKey: "archives.deletedOn", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
};

const VALID_PRIORITIES = new Set<Priority>(["low", "medium", "high"]);
const VALID_EFFORTS = new Set(["light", "medium", "heavy"] as const);

function safePriority(p: Todo["priority"]): Priority {
  return p && VALID_PRIORITIES.has(p) ? p : "medium";
}

function safeEffort(e: Todo["effort"] | undefined): "light" | "medium" | "heavy" {
  return e && VALID_EFFORTS.has(e as "light" | "medium" | "heavy") ? e : "medium";
}

type TaskArchiveConfirm =
  | { kind: "restore"; todo: Todo }
  | { kind: "delete"; todo: Todo }
  | { kind: "purge-all" }
  | { kind: "bulk-restore"; todos: Todo[] }
  | { kind: "bulk-delete"; todos: Todo[] }
  | null;

const archiveActionBtnBase =
  "inline-flex items-center justify-center rounded border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap";

export default function ArchivedTasksPanel() {
  const { t } = useLocale();
  const { user } = useAuth();
  const { toast } = useToast();
  const { resolveUser, displayName } = useUserLookup();
  const meUid = user?.uid ?? null;

  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [taskFilter, setTaskFilter] = useState<TodoStatus | "all">("all");
  const [taskImportFile, setTaskImportFile] = useState<File | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [taskConfirm, setTaskConfirm] = useState<TaskArchiveConfirm>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setLoading(true);
    });
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
  }, [toast, t, refreshKey]);

  useEffect(() => {
    const uids = new Set<string>();
    for (const td of todos) {
      if (td.assignedTo) uids.add(td.assignedTo);
      if (td.userId) uids.add(td.userId);
    }
    uids.forEach((uid) => resolveUser(uid));
  }, [todos, resolveUser]);

  const archivedIds = useMemo(() => new Set(todos.map((td) => td.id)), [todos]);

  // Treat an archived subtask as a root if its parent isn't itself in the archive
  // list (parent still active, or parent already purged). Otherwise the subtask
  // would be completely invisible.
  const isDisplayRoot = (td: Todo): boolean =>
    !td.parentId || !archivedIds.has(td.parentId);

  const filteredTasks = useMemo(() => {
    const list = taskFilter === "all" ? todos : todos.filter((td) => td.status === taskFilter);
    return list.filter(isDisplayRoot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todos, taskFilter, archivedIds]);

  useEffect(() => {
    const visible = new Set(filteredTasks.map((td) => td.id));
    setSelectedIds((prev) => {
      let removed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (visible.has(id)) next.add(id);
        else removed = true;
      }
      return removed ? next : prev;
    });
  }, [filteredTasks]);

  const selectedTodos = useMemo(
    () => filteredTasks.filter((td) => selectedIds.has(td.id)),
    [filteredTasks, selectedIds],
  );

  const selectedCount = selectedTodos.length;

  const allVisibleSelected =
    filteredTasks.length > 0 && selectedCount === filteredTasks.length;

  useEffect(() => {
    const el = selectAllRef.current;
    if (!el) return;
    el.indeterminate = selectedCount > 0 && !allVisibleSelected;
  }, [selectedCount, allVisibleSelected]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (filteredTasks.length === 0) return prev;
      const allIds = filteredTasks.map((td) => td.id);
      const allOn = allIds.every((id) => prev.has(id));
      return allOn ? new Set() : new Set(allIds);
    });
  }, [filteredTasks]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const taskCounts = useMemo(() => {
    const c = { all: 0, completed: 0, cancelled: 0, deleted: 0 };
    for (const td of todos) {
      if (!isDisplayRoot(td)) continue;
      c.all++;
      if (td.status === "completed") c.completed++;
      else if (td.status === "cancelled") c.cancelled++;
      else if (td.status === "deleted") c.deleted++;
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todos, archivedIds]);

  const ownedArchivedTaskCount = useMemo(
    () => todos.filter((td) => td.userId === meUid).length,
    [todos, meUid],
  );

  const runRestoreTask = async (todo: Todo) => {
    try {
      const updated = await updateTodo(todo.id, { status: "active" });
      setTodos((prev) => prev.filter((td) => td.id !== updated.id));
      toast.success(t("toast.taskRestored"));
    } catch {
      toast.error(t("toast.restoreError"));
    }
  };

  const runPermanentDeleteTask = async (todo: Todo) => {
    if (!meUid || todo.userId !== meUid) return;
    try {
      await deleteArchivedTodoPermanently(todo.id);
      setRefreshKey((k) => k + 1);
      toast.success(t("archives.taskDeletedForever"));
    } catch {
      toast.error(t("toast.deleteError"));
    }
  };

  const runPermanentDeleteTasksBulk = async (items: Todo[]) => {
    const owned = items.filter((td) => meUid && td.userId === meUid);
    if (owned.length === 0) return;
    try {
      for (const todo of owned) {
        await deleteArchivedTodoPermanently(todo.id);
      }
      setRefreshKey((k) => k + 1);
      toast.success(t("archives.taskDeletedForever"));
    } catch {
      toast.error(t("toast.deleteError"));
    }
  };

  const runPurgeAllMine = async () => {
    if (!meUid || ownedArchivedTaskCount === 0) return;
    try {
      const { removed } = await purgeAllArchivedTodos();
      setRefreshKey((k) => k + 1);
      toast.success(t("archives.purgeDone").replace("{count}", String(removed)));
    } catch {
      toast.error(t("toast.deleteError"));
    }
  };

  const runRestoreTasksBulk = async (list: Todo[]) => {
    if (list.length === 0) return;
    try {
      for (const todo of list) {
        const updated = await updateTodo(todo.id, { status: "active" });
        setTodos((prev) => prev.filter((td) => td.id !== updated.id));
      }
      toast.success(t("toast.taskRestored"));
    } catch {
      toast.error(t("toast.restoreError"));
    }
  };

  const handleTaskConfirm = () => {
    const c = taskConfirm;
    setTaskConfirm(null);
    if (!c) return;
    void (async () => {
      if (c.kind === "restore") await runRestoreTask(c.todo);
      else if (c.kind === "delete") await runPermanentDeleteTask(c.todo);
      else if (c.kind === "purge-all") await runPurgeAllMine();
      else if (c.kind === "bulk-restore") {
        await runRestoreTasksBulk(c.todos);
        clearSelection();
      } else if (c.kind === "bulk-delete") {
        await runPermanentDeleteTasksBulk(c.todos);
        clearSelection();
      }
    })();
  };

  const handleBulkRestoreClick = () => {
    if (selectedTodos.length === 0) return;
    setTaskConfirm({ kind: "bulk-restore", todos: selectedTodos });
  };

  const handleBulkDeleteClick = () => {
    const owned = selectedTodos.filter((td) => meUid && td.userId === meUid);
    if (owned.length === 0) {
      toast.error(t("archives.bulkDeleteNoOwnedTasks"));
      return;
    }
    setTaskConfirm({ kind: "bulk-delete", todos: owned });
  };

  const formatDate = (iso: string | undefined) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-slate-100">{t("archives.tasks")}</h1>
          <p className="text-sm text-zinc-500 dark:text-slate-400 mt-1">{t("archives.subtitle")}</p>
          <p className="text-xs text-zinc-500 dark:text-slate-500 mt-3 leading-relaxed border-l-2 border-zinc-200 dark:border-slate-600 pl-3">
            {t("archives.tasksPrivacy")}
          </p>
        </div>
        <div className="shrink-0 flex flex-wrap justify-end gap-2">
          {ownedArchivedTaskCount > 0 && (
            <button
              type="button"
              onClick={() => setTaskConfirm({ kind: "purge-all" })}
              className="rounded border border-red-200 dark:border-red-900/50 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
            >
              {t("archives.emptyMine")}
            </button>
          )}
          <ExportImportDropdown
            exportCsv={() => exportTasks("csv", { archivedOnly: true })}
            exportJson={() => exportTasks("json", { archivedOnly: true })}
            onImportFile={(f) => setTaskImportFile(f)}
            templateCsv={'title,status,priority,effort,estimatedMinutes,startDate,deadline,tags,projectId,phaseId,assignedTo\nMy task,active,medium,medium,,2025-06-01,2025-06-15,"tag1, tag2",,,'}
            templateJson={JSON.stringify([{ title: "My task", status: "active", priority: "medium", effort: "medium", deadline: "2025-06-15", tags: ["tag1"] }], null, 2)}
          />
        </div>
      </div>
      <TaskImportModal
        file={taskImportFile}
        open={taskImportFile !== null}
        onClose={() => setTaskImportFile(null)}
        onSuccess={() => setRefreshKey((k) => k + 1)}
      />

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
        <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-slate-800 text-xs text-zinc-500 dark:text-slate-400 uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-medium">{t("table.title")}</th>
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">{t("table.priority")}</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">{t("table.status")}</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">{t("archives.statusDateColumn")}</th>
                <th className="text-right px-4 py-3 font-medium min-w-[10rem]">{t("table.actions")}</th>
                <th className="w-10 px-1 py-3 text-center font-medium">
                  <span className="sr-only">{t("table.select")}</span>
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={() => toggleSelectAll()}
                    className="rounded border-zinc-300 dark:border-slate-600 dark:bg-slate-800 text-emerald-600 focus:ring-emerald-500"
                    aria-label={t("a11y.selectAllTasks")}
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {selectedCount > 0 && (
                <tr className="border-b border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/90 dark:bg-emerald-950/35">
                  <td colSpan={6} className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2 gap-y-2">
                      <span className="text-xs font-medium text-emerald-900 dark:text-emerald-100 mr-1">
                        {t("bulk.selectedCount").replace("{{count}}", String(selectedCount))}
                      </span>
                      <button
                        type="button"
                        onClick={handleBulkRestoreClick}
                        className="inline-flex items-center justify-center shrink-0 text-xs font-medium whitespace-nowrap px-2.5 py-1 rounded-md bg-white dark:bg-slate-800 border border-blue-200/80 dark:border-blue-800/60 text-blue-800 dark:text-blue-200 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                      >
                        {t("archives.restore")}
                      </button>
                      <button
                        type="button"
                        onClick={handleBulkDeleteClick}
                        className="inline-flex items-center justify-center shrink-0 text-xs font-medium whitespace-nowrap px-2.5 py-1 rounded-md bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                      >
                        {t("archives.deleteForever")}
                      </button>
                      <button
                        type="button"
                        onClick={clearSelection}
                        className="text-xs font-medium px-2.5 py-1 rounded-md text-emerald-700 dark:text-emerald-300 hover:underline ml-auto"
                      >
                        {t("bulk.clearSelection")}
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              {filteredTasks.map((todo) => {
                const dl = deadlineLabel(todo.deadline, t);
                const statusInfo = STATUS_STYLES[todo.status] ?? STATUS_STYLES.deleted;
                const subtasks = todos.filter((td) => td.parentId === todo.id);
                const pri = safePriority(todo.priority);
                const eff = safeEffort(todo.effort);

                return (
                  <tr key={todo.id} className="border-b border-zinc-50 dark:border-slate-800/50 last:border-0 hover:bg-zinc-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-600 dark:text-slate-300 line-through opacity-70">{displayTodoTitle(todo.title, t("todos.untitled"))}</span>
                        {todo.parentId && (
                          <span
                            className="text-[9px] font-medium text-purple-600 bg-purple-50 dark:bg-purple-950/40 dark:text-purple-300 px-1.5 py-0.5 rounded"
                            title={t("archives.subtaskBadgeTitle")}
                          >
                            ↳ {t("archives.subtaskBadge")}
                          </span>
                        )}
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
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${PRIORITY_BADGES[pri].cls}`}>
                          {t(`priority.${pri}`)}
                        </span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${EFFORT_BADGES[eff].cls}`}>
                          {t(EFFORT_BADGES[eff].tKey)}
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
                      <div className="flex flex-col items-end gap-1.5 sm:flex-row sm:justify-end sm:gap-2">
                        <button
                          type="button"
                          onClick={() => setTaskConfirm({ kind: "restore", todo })}
                          className={`${archiveActionBtnBase} border-blue-500 dark:border-blue-400 bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40`}
                        >
                          {t("archives.restore")}
                        </button>
                        {meUid && todo.userId === meUid && (
                          <button
                            type="button"
                            onClick={() => setTaskConfirm({ kind: "delete", todo })}
                            className={`${archiveActionBtnBase} border-red-500 dark:border-red-500/80 bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40`}
                          >
                            {t("archives.deleteForever")}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="w-10 px-1 py-3 align-middle text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(todo.id)}
                        onChange={() => toggleSelect(todo.id)}
                        className="rounded border-zinc-300 dark:border-slate-600 dark:bg-slate-800 text-emerald-600 focus:ring-emerald-500"
                        aria-label={t("a11y.selectTaskRow")}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={taskConfirm !== null}
        title={
          taskConfirm == null
            ? ""
            : taskConfirm.kind === "restore"
              ? t("archives.confirmRestoreTaskTitle")
              : taskConfirm.kind === "delete"
                ? t("archives.confirmDeleteTaskTitle")
                : taskConfirm.kind === "bulk-restore"
                  ? t("archives.bulkRestoreTasksTitle").replace("{{count}}", String(taskConfirm.todos.length))
                  : taskConfirm.kind === "bulk-delete"
                    ? t("archives.bulkDeleteTasksTitle").replace("{{count}}", String(taskConfirm.todos.length))
                    : t("archives.confirmPurgeTasksTitle")
        }
        message={
          taskConfirm == null
            ? ""
            : taskConfirm.kind === "restore"
              ? t("archives.confirmRestoreTaskMessage").replace(
                  "{title}",
                  displayTodoTitle(taskConfirm.todo.title, t("todos.untitled")),
                )
              : taskConfirm.kind === "delete"
                ? t("archives.deleteForeverConfirm")
                : taskConfirm.kind === "bulk-restore"
                  ? t("archives.bulkRestoreTasksMessage")
                  : taskConfirm.kind === "bulk-delete"
                    ? t("archives.bulkDeleteTasksMessage")
                    : t("archives.emptyMineConfirm").replace("{count}", String(ownedArchivedTaskCount))
        }
        variant={
          taskConfirm?.kind === "restore" || taskConfirm?.kind === "bulk-restore" ? "info" : "danger"
        }
        confirmLabel={
          taskConfirm?.kind === "restore" || taskConfirm?.kind === "bulk-restore"
            ? t("archives.restore")
            : t("archives.deleteForever")
        }
        onCancel={() => setTaskConfirm(null)}
        onConfirm={handleTaskConfirm}
      />
    </div>
  );
}
