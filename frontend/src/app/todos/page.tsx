"use client";

import { FormEvent, Fragment, useEffect, useState } from "react";

import AppShell from "@/components/AppShell";
import {
  createTodo,
  deleteTodo,
  getTodos,
  updateTodo,
  Todo,
  Priority,
  Effort,
  TodoStatus,
} from "@/lib/api";
import type { TranslationKey } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n";
import { useLocale } from "@/lib/LocaleContext";

type Quadrant = "do-first" | "schedule" | "delegate" | "eliminate";
type FilterKey = Quadrant | "completed" | "cancelled" | "deleted";

const URGENCY_THRESHOLD_DAYS = 3;

/**
 * Classification Eisenhower dynamique tenant compte de 3 axes :
 *   - Deadline (urgence)  : ≤1j très urgent, ≤3j bientôt, sinon non urgent
 *   - Priorité (importance) : high/medium = important, low = peu important
 *   - Effort (charge)     : light = quick win (promotion), heavy = lourd (démote si peu important)
 *
 * Règles :
 *   Très urgent (≤1j)
 *     → Faire, sauf si effort lourd + importance basse → Expédier
 *   Bientôt (≤3j)
 *     → Important → Faire
 *     → Peu important + lourd → Différer
 *     → Peu important + léger/moyen → Expédier
 *   Non urgent / pas de deadline
 *     → Important + léger → Faire (quick win)
 *     → Important + moyen/lourd → Planifier
 *     → Peu important + léger → Expédier (quick win)
 *     → Peu important + moyen/lourd → Différer
 */
function classify(todo: Todo): Quadrant {
  const important = todo.priority === "high" || todo.priority === "medium";
  const eff = todo.effort ?? "medium";

  if (todo.deadline) {
    const daysLeft =
      (new Date(todo.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24);

    if (daysLeft <= 1) {
      if (!important && eff === "heavy") return "delegate";
      return "do-first";
    }
    if (daysLeft <= URGENCY_THRESHOLD_DAYS) {
      if (important) return "do-first";
      if (eff === "heavy") return "eliminate";
      return "delegate";
    }
  }

  if (important) {
    if (eff === "light") return "do-first";
    return "schedule";
  }

  if (eff === "light") return "delegate";
  return "eliminate";
}

const QUADRANT_CONFIG: Record<
  Quadrant,
  {
    label: string;
    tKey: TranslationKey;
    icon: string;
    headerBg: string;
    headerText: string;
    cellBg: string;
    accentBar: string;
  }
> = {
  "do-first": {
    label: "FAIRE",
    tKey: "quadrant.doFirst" as const,
    icon: "🔥",
    headerBg: "bg-red-600 dark:bg-red-700",
    headerText: "text-white",
    cellBg: "bg-zinc-100/80 dark:bg-slate-800/60",
    accentBar: "bg-red-500",
  },
  schedule: {
    label: "PLANIFIER",
    tKey: "quadrant.schedule" as const,
    icon: "📅",
    headerBg: "bg-blue-600 dark:bg-blue-700",
    headerText: "text-white",
    cellBg: "bg-zinc-100/80 dark:bg-slate-800/60",
    accentBar: "bg-blue-500",
  },
  delegate: {
    label: "EXPÉDIER",
    tKey: "quadrant.delegate" as const,
    icon: "⚡",
    headerBg: "bg-amber-500 dark:bg-amber-600",
    headerText: "text-white",
    cellBg: "bg-zinc-100/80 dark:bg-slate-800/40",
    accentBar: "bg-amber-400",
  },
  eliminate: {
    label: "DIFFÉRER",
    tKey: "quadrant.eliminate" as const,
    icon: "⏸️",
    headerBg: "bg-zinc-400 dark:bg-slate-600",
    headerText: "text-white",
    cellBg: "bg-zinc-100/80 dark:bg-slate-800/40",
    accentBar: "bg-zinc-300 dark:bg-slate-500",
  },
};

const FILTER_BUTTONS: {
  key: FilterKey;
  label: string;
  tKey: TranslationKey;
  icon: string;
  activeClass: string;
}[] = [
  { key: "do-first", label: "Faire", tKey: "filter.doFirst" as const, icon: "🔥", activeClass: "bg-red-600 text-white border-red-600" },
  { key: "schedule", label: "Planifier", tKey: "filter.schedule" as const, icon: "📅", activeClass: "bg-blue-600 text-white border-blue-600" },
  { key: "delegate", label: "Expédier", tKey: "filter.delegate" as const, icon: "⚡", activeClass: "bg-amber-500 text-white border-amber-500" },
  { key: "eliminate", label: "Différer", tKey: "filter.eliminate" as const, icon: "⏸️", activeClass: "bg-zinc-400 text-white border-zinc-400" },
  { key: "completed", label: "Accomplies", tKey: "filter.completed" as const, icon: "✅", activeClass: "bg-green-600 text-white border-green-600" },
  { key: "cancelled", label: "Annulées", tKey: "filter.cancelled" as const, icon: "🚫", activeClass: "bg-zinc-600 text-white border-zinc-600" },
  { key: "deleted", label: "Supprimées", tKey: "filter.deleted" as const, icon: "🗑️", activeClass: "bg-zinc-800 text-white border-zinc-800" },
];

const PRIORITY_BADGES: Record<Priority, { label: string; tKey: TranslationKey; cls: string }> = {
  high: { label: "Haute", tKey: "priority.high" as const, cls: "bg-red-500 text-white dark:bg-red-600" },
  medium: { label: "Moyenne", tKey: "priority.medium" as const, cls: "bg-amber-500 text-white dark:bg-amber-600" },
  low: { label: "Basse", tKey: "priority.low" as const, cls: "bg-emerald-400 text-white dark:bg-emerald-600" },
};

const EFFORT_BADGES: Record<Effort, { label: string; tKey: TranslationKey; cls: string }> = {
  light: { label: "Léger", tKey: "effort.light" as const, cls: "bg-sky-400 text-white dark:bg-sky-600" },
  medium: { label: "Moyen", tKey: "effort.medium" as const, cls: "bg-[#6b8e23] text-white dark:bg-[#556b2f]" },
  heavy: { label: "Lourd", tKey: "effort.heavy" as const, cls: "bg-purple-700 text-white dark:bg-purple-800" },
};

const QUADRANT_BADGES: Record<Quadrant, { label: string; tKey: TranslationKey; cls: string }> = {
  "do-first": { label: "🔥 Faire", tKey: "badge.doFirst" as const, cls: "bg-red-500 text-white dark:bg-red-600" },
  schedule: { label: "📅 Planifier", tKey: "badge.schedule" as const, cls: "bg-blue-500 text-white dark:bg-blue-600" },
  delegate: { label: "⚡ Expédier", tKey: "badge.delegate" as const, cls: "bg-amber-500 text-white dark:bg-amber-600" },
  eliminate: { label: "⏸️ Différer", tKey: "badge.eliminate" as const, cls: "bg-emerald-400 text-white dark:bg-emerald-600" },
};

const SUBTASK_BADGE_CLS = "bg-indigo-500 text-white dark:bg-indigo-500";

function SubtaskBadge({ count }: { count: number }) {
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap ${SUBTASK_BADGE_CLS}`}>
      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 5.25h16.5m-16.5-10.5H12" />
      </svg>
      {count}
    </span>
  );
}

function formatDeadline(iso: string): string {
  const loc = getLocale() === "en" ? "en-US" : "fr-FR";
  return new Date(iso).toLocaleDateString(loc, {
    day: "numeric",
    month: "short",
  });
}

function daysUntil(iso: string): number {
  return Math.ceil(
    (new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
}

function deadlineLabel(iso: string, t: (key: TranslationKey) => string): { text: string; cls: string } {
  const d = daysUntil(iso);
  if (d < 0) return { text: t("deadline.overdue"), cls: "bg-red-500 text-white dark:bg-red-600" };
  if (d === 0) return { text: t("deadline.today"), cls: "bg-red-500 text-white dark:bg-red-600" };
  if (d === 1) return { text: t("deadline.tomorrow"), cls: "bg-amber-500 text-white dark:bg-amber-600" };
  if (d <= URGENCY_THRESHOLD_DAYS)
    return { text: `${d}${t("deadline.daysLeft")}`, cls: "bg-amber-500 text-white dark:bg-amber-600" };
  return { text: formatDeadline(iso), cls: "bg-emerald-400 text-white dark:bg-emerald-600" };
}

const QUADRANT_RANK: Record<Quadrant, number> = {
  "do-first": 1, schedule: 2, delegate: 3, eliminate: 4,
};
const PRIORITY_RANK: Record<Priority, number> = {
  high: 1, medium: 2, low: 3,
};

type SortColumn = "classification" | "priority" | "deadline";
type SortDirection = "asc" | "desc";

function sortTodos(todos: Todo[], column: SortColumn, direction: SortDirection): Todo[] {
  const sorted = [...todos];
  const dir = direction === "asc" ? 1 : -1;
  sorted.sort((a, b) => {
    switch (column) {
      case "classification":
        return (QUADRANT_RANK[classify(a)] - QUADRANT_RANK[classify(b)]) * dir;
      case "priority":
        return (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) * dir;
      case "deadline": {
        const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
        const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
        if (da === db) return 0;
        return (da - db) * dir;
      }
    }
  });
  return sorted;
}

export default function TodosPage() {
  const { t } = useLocale();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [priorityTouched, setPriorityTouched] = useState(false);
  const [effort, setEffort] = useState<Effort>("medium");
  const [effortTouched, setEffortTouched] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<"priority" | "effort" | null>(null);
  const [deadline, setDeadline] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [filters, setFilters] = useState<Set<FilterKey>>(new Set());
  const [sortCol, setSortCol] = useState<SortColumn>("classification");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");
  const [lastAction, setLastAction] = useState<{ todoId: string; previousStatus: TodoStatus } | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [mainView, setMainView] = useState<"list" | "cards" | "radar">("list");
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [editForm, setEditForm] = useState({ title: "", priority: "medium" as Priority, effort: "medium" as Effort, deadline: "" });
  const [editSaving, setEditSaving] = useState(false);

  const [subtaskParent, setSubtaskParent] = useState<Todo | null>(null);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [subtaskPriority, setSubtaskPriority] = useState<Priority>("medium");
  const [subtaskEffort, setSubtaskEffort] = useState<Effort>("medium");
  const [subtaskDeadline, setSubtaskDeadline] = useState("");
  const [subtaskSubmitting, setSubtaskSubmitting] = useState(false);

  const openEdit = (todo: Todo) => {
    setEditingTodo(todo);
    setEditForm({
      title: todo.title,
      priority: todo.priority,
      effort: todo.effort ?? "medium",
      deadline: todo.deadline ?? "",
    });
  };

  const saveEdit = async () => {
    if (!editingTodo) return;
    setEditSaving(true);
    try {
      const updated = await updateTodo(editingTodo.id, {
        title: editForm.title,
        priority: editForm.priority,
        effort: editForm.effort,
        deadline: editForm.deadline || null,
      });
      setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setEditingTodo(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur lors de la sauvegarde");
    } finally {
      setEditSaving(false);
    }
  };

  useEffect(() => {
    if (!openDropdown) return;
    const close = () => setOpenDropdown(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [openDropdown]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await getTodos();
        if (!cancelled) setTodos(list);
      } catch {
        /* auth handled by AppShell */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const todo = await createTodo({ title, priority, effort, deadline: deadline || null });
      setTodos((prev) => [todo, ...prev]);
      setTitle("");
      setDeadline("");
      setPriority("medium");
      setPriorityTouched(false);
      setEffort("medium");
      setEffortTouched(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Impossible de créer la tâche");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (todo: Todo, newStatus: TodoStatus) => {
    try {
      const previousStatus = todo.status;
      const updated = await updateTodo(todo.id, { status: newStatus });
      setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setLastAction({ todoId: todo.id, previousStatus });
    } catch { /* noop */ }
  };

  const handleDelete = async (todo: Todo) => {
    try {
      const previousStatus = todo.status;
      if (todo.status === "deleted") {
        const restored = await updateTodo(todo.id, { status: "active" });
        setTodos((prev) => prev.map((t) => (t.id === restored.id ? restored : t)));
        setLastAction({ todoId: todo.id, previousStatus });
      } else {
        const updated = await deleteTodo(todo.id);
        setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        setLastAction({ todoId: todo.id, previousStatus });
      }
    } catch { /* noop */ }
  };

  const handleUndo = async () => {
    if (!lastAction || undoing) return;
    setUndoing(true);
    try {
      const updated = await updateTodo(lastAction.todoId, { status: lastAction.previousStatus });
      setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setLastAction(null);
    } catch { /* noop */ }
    finally { setUndoing(false); }
  };

  const getSubtasks = (parentId: string) => todos.filter(t => t.parentId === parentId);

  const handleCreateSubtask = async () => {
    if (!subtaskParent || !subtaskTitle.trim()) return;
    setSubtaskSubmitting(true);
    try {
      const todo = await createTodo({
        title: subtaskTitle,
        priority: subtaskPriority,
        effort: subtaskEffort,
        deadline: subtaskDeadline || null,
        parentId: subtaskParent.id,
      });
      setTodos(prev => [todo, ...prev]);
      setSubtaskTitle("");
      setSubtaskPriority("medium");
      setSubtaskEffort("medium");
      setSubtaskDeadline("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
    } finally {
      setSubtaskSubmitting(false);
    }
  };

  const openSubtaskModal = (todo: Todo) => {
    setSubtaskParent(todo);
    setSubtaskTitle("");
    setSubtaskPriority("medium");
    setSubtaskEffort("medium");
    setSubtaskDeadline("");
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <span className="animate-pulse text-zinc-400 dark:text-slate-500 text-sm">{t("loading")}</span>
        </div>
      </AppShell>
    );
  }

  const activeTodos = todos.filter((t) => t.status === "active" && !t.parentId);
  const completedTodos = todos.filter((t) => t.status === "completed" && !t.parentId);
  const cancelledTodos = todos.filter((t) => t.status === "cancelled" && !t.parentId);
  const deletedTodos = todos.filter((t) => t.status === "deleted" && !t.parentId);

  const grouped: Record<Quadrant, Todo[]> = {
    "do-first": activeTodos.filter((t) => classify(t) === "do-first"),
    schedule: activeTodos.filter((t) => classify(t) === "schedule"),
    delegate: activeTodos.filter((t) => classify(t) === "delegate"),
    eliminate: activeTodos.filter((t) => classify(t) === "eliminate"),
  };

  const subtaskCounts: Record<string, number> = {};
  for (const td of todos) {
    if (td.parentId) {
      subtaskCounts[td.parentId] = (subtaskCounts[td.parentId] ?? 0) + 1;
    }
  }

  const filterCounts: Record<FilterKey, number> = {
    "do-first": grouped["do-first"].length,
    schedule: grouped.schedule.length,
    delegate: grouped.delegate.length,
    eliminate: grouped.eliminate.length,
    completed: completedTodos.length,
    cancelled: cancelledTodos.length,
    deleted: deletedTodos.length,
  };

  const toggleFilter = (key: FilterKey) => {
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const QUADRANT_KEYS: Quadrant[] = ["do-first", "schedule", "delegate", "eliminate"];
  const STATUS_KEYS: FilterKey[] = ["completed", "cancelled", "deleted"];

  let listTodos: Todo[];
  if (filters.size === 0) {
    listTodos = activeTodos;
  } else {
    const parts: Todo[][] = [];
    for (const f of filters) {
      if (f === "completed") parts.push(completedTodos);
      else if (f === "cancelled") parts.push(cancelledTodos);
      else if (f === "deleted") parts.push(deletedTodos);
      else parts.push(grouped[f]);
    }
    listTodos = parts.flat();
  }

  const activeQuadrantFilters = QUADRANT_KEYS.filter((k) => filters.has(k));
  const activeStatusFilters = STATUS_KEYS.filter((k) => filters.has(k));

  return (
    <AppShell>
      <div className="max-w-[1400px] space-y-6">
        {/* ── Create form ── */}
        <form
          onSubmit={handleCreate}
          className="bg-white dark:bg-slate-900 rounded-md shadow-sm border border-zinc-200 dark:border-slate-700 p-5"
        >
          <div className="hidden sm:flex gap-3 mb-1 px-1">
            <span className="flex-1 text-[10px] uppercase tracking-wider text-zinc-400 dark:text-slate-500">{t("todos.titleLabel")}</span>
            <span className="min-w-[100px] text-[10px] uppercase tracking-wider text-zinc-400 dark:text-slate-500">{t("todos.importanceLabel")}</span>
            <span className="min-w-[100px] text-[10px] uppercase tracking-wider text-zinc-400 dark:text-slate-500">{t("todos.effortLabel")}</span>
            <span className="shrink-0 text-[10px] uppercase tracking-wider text-zinc-400 dark:text-slate-500" style={{width: 144}}>{t("todos.deadlineLabel")}</span>
            <span className="min-w-[100px] text-[10px] uppercase tracking-wider text-zinc-400 dark:text-slate-500">&nbsp;</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder={t("todos.addPlaceholder")}
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="flex-1 rounded border border-zinc-300 dark:border-slate-600 px-4 py-2.5 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 placeholder:text-zinc-400 focus:border-zinc-900 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-slate-400"
            />
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenDropdown(openDropdown === "priority" ? null : "priority");
                }}
                className={`rounded border px-3 py-2.5 text-sm font-medium transition-colors h-[42px] min-w-[100px] text-center ${
                  priorityTouched
                    ? `${PRIORITY_BADGES[priority].cls} border-transparent`
                    : "border-zinc-300 dark:border-slate-600 text-zinc-400 dark:text-slate-500 hover:text-zinc-700 dark:hover:text-slate-200 hover:border-zinc-400 dark:hover:border-slate-400"
                }`}
              >
                {priorityTouched ? t(PRIORITY_BADGES[priority].tKey) : t("todos.importanceLabel")}
              </button>
              {openDropdown === "priority" && (
                <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-slate-800 border border-zinc-200 dark:border-slate-600 rounded shadow-lg py-1 min-w-[120px]">
                  {(["high", "medium", "low"] as Priority[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setPriority(p);
                        setPriorityTouched(true);
                        setOpenDropdown(null);
                      }}
                      className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-slate-700 transition-colors ${
                        priority === p ? "font-semibold text-zinc-900 dark:text-slate-100" : "text-zinc-600 dark:text-slate-300"
                      }`}
                    >
                      {t(PRIORITY_BADGES[p].tKey)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenDropdown(openDropdown === "effort" ? null : "effort");
                }}
                className={`rounded border px-3 py-2.5 text-sm font-medium transition-colors h-[42px] min-w-[100px] text-center ${
                  effortTouched
                    ? `${EFFORT_BADGES[effort].cls} border-transparent`
                    : "border-zinc-300 dark:border-slate-600 text-zinc-400 dark:text-slate-500 hover:text-zinc-700 dark:hover:text-slate-200 hover:border-zinc-400 dark:hover:border-slate-400"
                }`}
              >
                {effortTouched ? t(EFFORT_BADGES[effort].tKey) : t("todos.effortLabel")}
              </button>
              {openDropdown === "effort" && (
                <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-slate-800 border border-zinc-200 dark:border-slate-600 rounded shadow-lg py-1 min-w-[120px]">
                  {(["light", "medium", "heavy"] as Effort[]).map((eff) => (
                    <button
                      key={eff}
                      type="button"
                      onClick={() => {
                        setEffort(eff);
                        setEffortTouched(true);
                        setOpenDropdown(null);
                      }}
                      className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-slate-700 transition-colors ${
                        effort === eff ? "font-semibold text-zinc-900 dark:text-slate-100" : "text-zinc-600 dark:text-slate-300"
                      }`}
                    >
                      {t(EFFORT_BADGES[eff].tKey)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="shrink-0 rounded border border-zinc-300 dark:border-slate-600 px-3 py-2.5 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-zinc-900 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-slate-400 h-[42px]"
            />
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-zinc-900 dark:bg-slate-100 px-6 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-zinc-800 dark:hover:bg-slate-300 disabled:opacity-60 whitespace-nowrap transition-colors h-[42px] min-w-[100px]"
            >
              {submitting ? t("todos.adding") : t("todos.add")}
            </button>
          </div>
          {formError && (
            <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {formError}
            </p>
          )}
        </form>

        {/* ── Filter buttons + Undo ── */}
        <div className="flex gap-2 items-center">
          <div className="flex flex-wrap gap-2 flex-1">
          {FILTER_BUTTONS.map((btn) => {
            const count = filterCounts[btn.key];
            const isActive = filters.has(btn.key);
            return (
              <button
                key={btn.key}
                type="button"
                onClick={() => toggleFilter(btn.key)}
                className={`inline-flex items-center justify-center gap-1.5 rounded border px-2 py-2 text-sm font-medium transition-colors flex-1 min-w-[7rem] ${
                  isActive
                    ? btn.activeClass
                    : "border-zinc-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-700"
                }`}
              >
                <span>{btn.icon}</span>
                <span>{t(btn.tKey)}</span>
                <span className={`ml-0.5 text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1 ${
                  isActive ? "bg-white/25" : "bg-zinc-100 dark:bg-slate-700 text-zinc-500 dark:text-slate-400"
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
          </div>
          <button
            type="button"
            onClick={handleUndo}
            disabled={!lastAction || undoing}
            title={t("todos.undoTitle")}
            className={`shrink-0 inline-flex items-center gap-1.5 rounded border px-3.5 py-2 text-sm font-medium transition-colors ${
              lastAction
                ? "border-zinc-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-700"
                : "border-zinc-100 dark:border-slate-700 bg-zinc-50 dark:bg-slate-800/50 text-zinc-300 dark:text-slate-600 cursor-not-allowed"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
            </svg>
            <span>{t("todos.undo")}</span>
          </button>
        </div>

        {/* ── Main view (List / Cards / Radar) ── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-zinc-700 dark:text-slate-300 tracking-wide uppercase">
              {mainView === "list" ? t("todos.listTitle") : t("todos.matrixTitle")}
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-zinc-400">
                {mainView === "list"
                  ? `${listTodos.length} ${listTodos.length !== 1 ? t("dashboard.tasksCount") : t("dashboard.taskCount")}`
                  : `${activeTodos.length} ${activeTodos.length !== 1 ? t("dashboard.tasksCount") : t("dashboard.taskCount")}`
                }
                {filters.size > 0 ? ` (${[...filters].map((f) => { const btn = FILTER_BUTTONS.find((b) => b.key === f); return btn ? t(btn.tKey) : f; }).join(", ")})` : ""}
              </span>
              <div className="flex rounded border border-zinc-200 dark:border-slate-600 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setMainView("list")}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    mainView === "list"
                      ? "bg-zinc-900 dark:bg-slate-100 text-white dark:text-slate-900"
                      : "bg-white dark:bg-slate-800 text-zinc-600 dark:text-slate-400 hover:bg-zinc-50 dark:hover:bg-slate-700"
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                  {t("view.list")}
                </button>
                <button
                  type="button"
                  onClick={() => setMainView("cards")}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 border-l border-zinc-200 dark:border-slate-600 ${
                    mainView === "cards"
                      ? "bg-zinc-900 dark:bg-slate-100 text-white dark:text-slate-900"
                      : "bg-white dark:bg-slate-800 text-zinc-600 dark:text-slate-400 hover:bg-zinc-50 dark:hover:bg-slate-700"
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                  {t("view.cards")}
                </button>
                <button
                  type="button"
                  onClick={() => setMainView("radar")}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 border-l border-zinc-200 dark:border-slate-600 ${
                    mainView === "radar"
                      ? "bg-zinc-900 dark:bg-slate-100 text-white dark:text-slate-900"
                      : "bg-white dark:bg-slate-800 text-zinc-600 dark:text-slate-400 hover:bg-zinc-50 dark:hover:bg-slate-700"
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="3" />
                    <circle cx="5" cy="8" r="2" />
                    <circle cx="18" cy="6" r="2" />
                    <circle cx="7" cy="17" r="2" />
                    <circle cx="17" cy="16" r="2" />
                  </svg>
                  {t("view.radar")}
                </button>
              </div>
            </div>
          </div>

          {mainView === "list" ? (
            <TaskList
              todos={listTodos}
              allTodos={todos}
              sortCol={sortCol}
              sortDir={sortDir}
              onSort={(col) => {
                if (col === sortCol) {
                  setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                } else {
                  setSortCol(col);
                  setSortDir("asc");
                }
              }}
              onComplete={(t) => handleStatusChange(t, t.status === "completed" ? "active" : "completed")}
              onCancel={(t) => handleStatusChange(t, t.status === "cancelled" ? "active" : "cancelled")}
              onDelete={(t) => handleDelete(t)}
              onEdit={openEdit}
              onSubtask={openSubtaskModal}
            />
          ) : mainView === "cards" ? (
            <div className="bg-white dark:bg-slate-900 rounded-md shadow-sm border border-zinc-200 dark:border-slate-700 p-4">
              {filters.size > 0 && activeQuadrantFilters.length === 0 ? (
                /* Only status filters: show archived list */
                <div className="min-h-[220px]">
                  <div className="px-1 py-2 mb-3">
                    <span className="text-xs font-bold tracking-[0.15em] uppercase text-zinc-500">
                      {activeStatusFilters.map((f) => { const btn = FILTER_BUTTONS.find((b) => b.key === f); return btn ? btn.icon + " " + t(btn.tKey) : f; }).join(" · ")}
                    </span>
                  </div>
                  {listTodos.length === 0 ? (
                    <div className="flex items-center justify-center min-h-[140px]">
                      <p className="text-xs text-zinc-400 italic">{t("matrix.empty")}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {listTodos.map((todo) => (
                        <MatrixCard key={todo.id} todo={todo} onComplete={(t) => handleStatusChange(t, t.status === "completed" ? "active" : "completed")} onDelete={(t) => handleDelete(t)} onEdit={openEdit} subtaskCount={getSubtasks(todo.id).length} />
                      ))}
                    </div>
                  )}
                </div>
              ) : filters.size > 0 && activeQuadrantFilters.length > 0 ? (
                /* Quadrant filters: show selected quadrants expanded */
                <div className={`grid gap-2 ${activeQuadrantFilters.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
                  {activeQuadrantFilters.map((q) => (
                    <div key={q} className="rounded overflow-hidden">
                      <QuadrantCell quadrant={q} todos={grouped[q]} allTodos={todos} onComplete={(t) => handleStatusChange(t, "completed")} onDelete={(t) => handleDelete(t)} onEdit={openEdit} subtaskCounts={subtaskCounts} />
                    </div>
                  ))}
                  {activeStatusFilters.length > 0 && (
                    <div className="min-h-[120px] col-span-full">
                      <div className="px-1 py-2 mb-2">
                        <span className="text-xs font-bold tracking-[0.15em] uppercase text-zinc-500">
                          {activeStatusFilters.map((f) => { const btn = FILTER_BUTTONS.find((b) => b.key === f); return btn ? btn.icon + " " + t(btn.tKey) : f; }).join(" · ")}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {activeStatusFilters.flatMap((f) =>
                          f === "completed" ? completedTodos : f === "cancelled" ? cancelledTodos : deletedTodos
                        ).map((todo) => (
                          <MatrixCard key={todo.id} todo={todo} onComplete={(t) => handleStatusChange(t, t.status === "completed" ? "active" : "completed")} onDelete={(t) => handleDelete(t)} onEdit={openEdit} subtaskCount={getSubtasks(todo.id).length} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* No filter: show full 2x2 matrix */
                <>
                  {/* Column headers */}
                  <div className="grid grid-cols-[auto_1fr_1fr] gap-x-2 mb-2">
                    <div className="w-10" />
                    <div className="text-center py-2 bg-zinc-50/50 dark:bg-slate-800/50 rounded">
                      <span className="text-xs font-bold tracking-[0.15em] uppercase text-blue-500">
                        🕐 {t("matrix.notUrgent")}
                      </span>
                    </div>
                    <div className="text-center py-2 bg-zinc-50/50 dark:bg-slate-800/50 rounded">
                      <span className="text-xs font-bold tracking-[0.15em] uppercase text-amber-600">
                        ⚡ {t("matrix.urgent")}
                      </span>
                    </div>
                  </div>

                  {/* Important row */}
                  <div className="grid grid-cols-[auto_1fr_1fr] gap-x-2">
                    <div className="w-10 flex items-center justify-center bg-zinc-50/50 dark:bg-slate-800/50 rounded-l">
                      <span className="[writing-mode:vertical-lr] rotate-180 text-xs font-bold tracking-[0.15em] uppercase text-red-500">
                        {t("matrix.important")}
                      </span>
                    </div>
                    <div className="rounded overflow-hidden">
                      <QuadrantCell quadrant="schedule" todos={grouped.schedule} allTodos={todos} onComplete={(t) => handleStatusChange(t, "completed")} onDelete={(t) => handleDelete(t)} onEdit={openEdit} subtaskCounts={subtaskCounts} />
                    </div>
                    <div className="rounded overflow-hidden">
                      <QuadrantCell quadrant="do-first" todos={grouped["do-first"]} allTodos={todos} onComplete={(t) => handleStatusChange(t, "completed")} onDelete={(t) => handleDelete(t)} onEdit={openEdit} subtaskCounts={subtaskCounts} />
                    </div>
                  </div>

                  {/* Not important row */}
                  <div className="grid grid-cols-[auto_1fr_1fr] gap-x-2 mt-2">
                    <div className="w-10 flex items-center justify-center bg-zinc-50/50 dark:bg-slate-800/50 rounded-l">
                      <span className="[writing-mode:vertical-lr] rotate-180 text-xs font-bold tracking-[0.15em] uppercase text-zinc-400">
                        {t("matrix.notImportant")}
                      </span>
                    </div>
                    <div className="rounded overflow-hidden">
                      <QuadrantCell quadrant="eliminate" todos={grouped.eliminate} allTodos={todos} onComplete={(t) => handleStatusChange(t, "completed")} onDelete={(t) => handleDelete(t)} onEdit={openEdit} subtaskCounts={subtaskCounts} />
                    </div>
                    <div className="rounded overflow-hidden">
                      <QuadrantCell quadrant="delegate" todos={grouped.delegate} allTodos={todos} onComplete={(t) => handleStatusChange(t, "completed")} onDelete={(t) => handleDelete(t)} onEdit={openEdit} subtaskCounts={subtaskCounts} />
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-md shadow-sm border border-zinc-200 dark:border-slate-700 p-6">
              <div className="flex gap-6">
                {/* Priority list */}
                <div className="w-72 shrink-0">
                  <h3 className="text-sm font-semibold text-zinc-700 dark:text-slate-300 mb-3 flex items-center gap-1.5">
                    {filters.size === 0
                      ? t("todos.priorities")
                      : [...filters].map((f) => { const btn = FILTER_BUTTONS.find((b) => b.key === f); return btn ? t(btn.tKey) : f; }).join(", ")}
                  </h3>
                  <div className="space-y-2">
                    {(() => {
                      const radarListSource: Todo[] = filters.size === 0
                        ? activeTodos
                        : listTodos;
                      const priorityTodos = [...radarListSource].sort((a, b) => {
                        const rA = QUADRANT_RANK[classify(a)];
                        const rB = QUADRANT_RANK[classify(b)];
                        if (rA !== rB) return rA - rB;
                        const pA = PRIORITY_RANK[a.priority];
                        const pB = PRIORITY_RANK[b.priority];
                        if (pA !== pB) return pA - pB;
                        const dA = a.deadline ? new Date(a.deadline).getTime() : Infinity;
                        const dB = b.deadline ? new Date(b.deadline).getTime() : Infinity;
                        return dA - dB;
                      });
                      const CARD_BG: Record<Quadrant, string> = {
                        "do-first": "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800",
                        schedule: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800",
                        delegate: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800",
                        eliminate: "bg-zinc-50 dark:bg-slate-800/40 border-zinc-200 dark:border-slate-700",
                      };
                      return priorityTodos.slice(0, 12).map((todo, i) => {
                        const q = classify(todo);
                        const dl = todo.deadline ? deadlineLabel(todo.deadline, t) : null;
                        return (
                          <div
                            key={todo.id}
                            onDoubleClick={(e) => { e.preventDefault(); openEdit(todo); }}
                            className={`group/card flex items-start gap-2 rounded border px-2.5 py-2 cursor-pointer select-none ${CARD_BG[q]}`}
                          >
                            <span className="text-xs font-bold text-zinc-400 mt-0.5 w-4 text-right shrink-0">
                              {i + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-zinc-900 dark:text-slate-100 leading-snug truncate">
                                {todo.title}
                              </p>
                              <div className="flex items-center gap-1 mt-1 flex-nowrap">
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap ${QUADRANT_BADGES[q].cls}`}>
                                  {t(QUADRANT_BADGES[q].tKey)}
                                </span>
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap ${EFFORT_BADGES[todo.effort ?? "medium"].cls}`}>
                                  {t(EFFORT_BADGES[todo.effort ?? "medium"].tKey)}
                                </span>
                                {dl && (
                                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap ${dl.cls}`}>{dl.text}</span>
                                )}
                                {(subtaskCounts[todo.id] ?? 0) > 0 && (
                                  <SubtaskBadge count={subtaskCounts[todo.id]} />
                                )}
                              </div>
                            </div>
                            {todo.status !== "active" ? (
                              <button
                                onClick={() => handleStatusChange(todo, "active")}
                                title="Remettre en tâche active"
                                className="shrink-0 inline-flex items-center gap-0.5 rounded border border-green-300 dark:border-green-700 px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/40 transition-colors"
                              >
                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
                                </svg>
                                {t("todos.reactivate")}
                              </button>
                            ) : (
                              <div className="flex items-center gap-1 shrink-0 mt-0.5">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleStatusChange(todo, "completed"); }}
                                  className="p-0.5 text-zinc-300 dark:text-slate-600 hover:text-green-600 dark:hover:text-green-400 cursor-pointer"
                                  aria-label="Accomplir"
                                  title="Accomplir"
                                >
                                  <svg className="w-3.5 h-3.5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleStatusChange(todo, "cancelled"); }}
                                  className="p-0.5 text-zinc-300 dark:text-slate-600 hover:text-amber-600 dark:hover:text-amber-400 cursor-pointer"
                                  aria-label="Annuler"
                                  title="Annuler"
                                >
                                  <svg className="w-3.5 h-3.5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleDelete(todo); }}
                                  className="p-0.5 text-zinc-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 cursor-pointer"
                                  aria-label="Supprimer"
                                  title="Supprimer"
                                >
                                  <svg className="w-3.5 h-3.5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

                {/* Radar */}
                <div className="flex-1">
                  <ScatterMatrix todos={activeTodos} subtaskCounts={subtaskCounts} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Edit Modal ── */}
      {editingTodo && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setEditingTodo(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-lg shadow-2xl border border-zinc-200 dark:border-slate-700 w-full max-w-lg mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-slate-100 mb-4">{t("edit.title")}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("edit.titleField")}</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditingTodo(null); }}
                  autoFocus
                  className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-zinc-900 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-slate-400"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("edit.priority")}</label>
                  <select
                    value={editForm.priority}
                    onChange={(e) => setEditForm((f) => ({ ...f, priority: e.target.value as Priority }))}
                    className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-zinc-900 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-slate-400"
                  >
                    <option value="high">{t("priority.high")}</option>
                    <option value="medium">{t("priority.medium")}</option>
                    <option value="low">{t("priority.low")}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("edit.effort")}</label>
                  <select
                    value={editForm.effort}
                    onChange={(e) => setEditForm((f) => ({ ...f, effort: e.target.value as Effort }))}
                    className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-zinc-900 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-slate-400"
                  >
                    <option value="light">{t("effort.light")}</option>
                    <option value="medium">{t("effort.medium")}</option>
                    <option value="heavy">{t("effort.heavy")}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("edit.deadline")}</label>
                  <input
                    type="date"
                    value={editForm.deadline}
                    onChange={(e) => setEditForm((f) => ({ ...f, deadline: e.target.value }))}
                    className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-zinc-900 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-slate-400"
                  />
                </div>
              </div>
            </div>
            {!editingTodo.parentId && (
              <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-zinc-700 dark:text-slate-300">{t("subtask.title")}</h4>
                  <button
                    type="button"
                    onClick={() => openSubtaskModal(editingTodo)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {t("subtask.addShort")}
                  </button>
                </div>
                {getSubtasks(editingTodo.id).length === 0 ? (
                  <p className="text-xs text-zinc-400 dark:text-slate-500">{t("subtask.none")}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {getSubtasks(editingTodo.id).map((sub) => (
                      <li key={sub.id} className="flex items-center gap-2 text-sm">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sub.status === "completed" ? "bg-green-500" : sub.status === "active" ? "bg-blue-500" : "bg-zinc-300"}`} />
                        <span className={sub.status === "completed" ? "line-through text-zinc-400" : "text-zinc-700 dark:text-slate-300"}>{sub.title}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="flex items-center mt-5">
              {!editingTodo.parentId && (
                <button
                  type="button"
                  onClick={() => openSubtaskModal(editingTodo)}
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
                  onClick={() => setEditingTodo(null)}
                  className="rounded border border-zinc-200 dark:border-slate-600 px-4 py-2 text-sm font-medium text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
                >
                  {t("edit.cancel")}
                </button>
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={editSaving || !editForm.title.trim()}
                  className="rounded bg-zinc-900 dark:bg-slate-100 px-5 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-zinc-800 dark:hover:bg-slate-300 disabled:opacity-60 transition-colors"
                >
                  {editSaving ? t("edit.saving") : t("edit.save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Subtask Modal ── */}
      {subtaskParent && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setSubtaskParent(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-lg shadow-2xl border border-zinc-200 dark:border-slate-700 w-full max-w-md mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-slate-100 mb-1">{t("subtask.add")}</h3>
            <p className="text-xs text-zinc-400 dark:text-slate-500 mb-4 truncate">↳ {subtaskParent.title}</p>

            {getSubtasks(subtaskParent.id).length > 0 && (
              <ul className="space-y-1.5 mb-4 max-h-40 overflow-y-auto">
                {getSubtasks(subtaskParent.id).map((sub) => {
                  const badge = PRIORITY_BADGES[sub.priority];
                  return (
                    <li key={sub.id} className="flex items-center gap-2 text-sm">
                      <button
                        onClick={() => handleStatusChange(sub, sub.status === "completed" ? "active" : "completed")}
                        className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${sub.status === "completed" ? "bg-green-500 border-green-500 text-white" : "border-zinc-300 dark:border-slate-500 hover:border-green-500 text-transparent hover:text-green-500"}`}
                      >
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                      <span className={`flex-1 truncate ${sub.status === "completed" ? "line-through text-zinc-400" : "text-zinc-700 dark:text-slate-300"}`}>{sub.title}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${badge.cls}`}>{t(badge.tKey)}</span>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="space-y-3">
              <input
                type="text"
                placeholder={t("subtask.placeholder")}
                value={subtaskTitle}
                onChange={(e) => setSubtaskTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && subtaskTitle.trim()) handleCreateSubtask(); if (e.key === "Escape") setSubtaskParent(null); }}
                autoFocus
                className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-zinc-900 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-slate-400"
              />
              <div className="grid grid-cols-3 gap-2">
                <select value={subtaskPriority} onChange={(e) => setSubtaskPriority(e.target.value as Priority)} className="rounded border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-xs text-zinc-900 dark:text-slate-100 dark:bg-slate-800">
                  <option value="high">{t("priority.high")}</option>
                  <option value="medium">{t("priority.medium")}</option>
                  <option value="low">{t("priority.low")}</option>
                </select>
                <select value={subtaskEffort} onChange={(e) => setSubtaskEffort(e.target.value as Effort)} className="rounded border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-xs text-zinc-900 dark:text-slate-100 dark:bg-slate-800">
                  <option value="light">{t("effort.light")}</option>
                  <option value="medium">{t("effort.medium")}</option>
                  <option value="heavy">{t("effort.heavy")}</option>
                </select>
                <input
                  type="date"
                  value={subtaskDeadline}
                  onChange={(e) => setSubtaskDeadline(e.target.value)}
                  max={subtaskParent.deadline || undefined}
                  className="rounded border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-xs text-zinc-900 dark:text-slate-100 dark:bg-slate-800"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setSubtaskParent(null)}
                className="rounded border border-zinc-200 dark:border-slate-600 px-4 py-2 text-sm font-medium text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
              >
                {t("subtask.cancel")}
              </button>
              <button
                type="button"
                onClick={() => setSubtaskParent(null)}
                className="rounded border border-green-300 dark:border-green-700 px-4 py-2 text-sm font-medium text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/40 transition-colors"
              >
                {t("subtask.done")}
              </button>
              <button
                type="button"
                onClick={handleCreateSubtask}
                disabled={subtaskSubmitting || !subtaskTitle.trim()}
                className="rounded bg-zinc-900 dark:bg-slate-100 px-5 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-zinc-800 dark:hover:bg-slate-300 disabled:opacity-60 transition-colors"
              >
                {subtaskSubmitting ? t("subtask.adding") : t("subtask.create")}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

/* ── Scatter Matrix (Gartner Magic Quadrant style) ── */

/** Deterministic pseudo-random from string, returns 0-1 */
function seededRandom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  return ((h & 0x7fffffff) % 1000) / 1000;
}

/**
 * X-axis: urgency score (0=pas urgent, 100=très urgent).
 * Important/pas important détermine le quadrant gauche/droite,
 * donc X doit rester cohérent avec la classification.
 */
function urgencyScore(todo: Todo): number {
  const q = classify(todo);
  const isUrgent = q === "do-first" || q === "delegate";
  const jitter = seededRandom(todo.id + "x") * 15;

  if (isUrgent) {
    if (!todo.deadline) return 60 + jitter;
    const days = (new Date(todo.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (days < 0) return 78 + jitter * 0.6;
    if (days <= 1) return 72 + jitter * 0.8;
    if (days <= 3) return 65 + jitter;
    return 58 + jitter;
  }

  if (!todo.deadline) return 15 + jitter;
  const days = (new Date(todo.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (days <= 7) return 30 + jitter;
  if (days <= 14) return 22 + jitter;
  return 12 + jitter;
}

/**
 * Y-axis: importance score (0=pas important, 100=très important).
 * Doit respecter la classification : do-first/schedule → top (>50), delegate/eliminate → bottom (<50).
 * La priorité affine la position dans la bonne moitié.
 */
function importanceScore(todo: Todo): number {
  const q = classify(todo);
  const isImportant = q === "do-first" || q === "schedule";
  const jitter = seededRandom(todo.id + "y") * 12;

  const priorityBonus: Record<Priority, number> = { high: 18, medium: 8, low: 0 };
  const bonus = priorityBonus[todo.priority];

  if (isImportant) return 58 + bonus + jitter;
  return 12 + bonus + jitter;
}

const DOT_COLORS: Record<Quadrant, string> = {
  "do-first": "bg-red-500",
  schedule: "bg-blue-500",
  delegate: "bg-amber-400",
  eliminate: "bg-zinc-400",
};

function ScatterMatrix({ todos, subtaskCounts = {} }: { todos: Todo[]; subtaskCounts?: Record<string, number> }) {
  const { t } = useLocale();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div className="max-w-[calc(100vh-16rem)] mx-auto">
      {/* Column headers */}
      <div className="grid grid-cols-[auto_1fr_1fr] gap-x-2 mb-2">
        <div className="w-10" />
        <div className="text-center py-2 bg-zinc-50/50 dark:bg-slate-800/50 rounded">
          <span className="text-xs font-bold tracking-[0.15em] uppercase text-blue-500">
            🕐 {t("matrix.notUrgent")}
          </span>
        </div>
        <div className="text-center py-2 bg-zinc-50/50 dark:bg-slate-800/50 rounded">
          <span className="text-xs font-bold tracking-[0.15em] uppercase text-amber-600">
            ⚡ {t("matrix.urgent")}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-x-2">
        {/* Y-axis */}
        <div className="w-10 flex flex-col gap-y-px bg-zinc-50/50 dark:bg-slate-800/50 rounded">
          <div className="flex-1 flex items-center justify-center">
            <span className="[writing-mode:vertical-lr] rotate-180 text-xs font-bold tracking-[0.15em] uppercase text-red-500">
              {t("matrix.important")}
            </span>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <span className="[writing-mode:vertical-lr] rotate-180 text-xs font-bold tracking-[0.15em] uppercase text-zinc-400">
              {t("matrix.notImportant")}
            </span>
          </div>
        </div>

        {/* Plot area */}
        <div className="relative overflow-visible aspect-square border border-zinc-200 dark:border-slate-600 rounded">
          {/* Quadrant backgrounds */}
          <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px bg-zinc-200 dark:bg-slate-600 rounded overflow-hidden">
            <div className="bg-zinc-100/80 dark:bg-slate-800/60" />
            <div className="bg-zinc-100/80 dark:bg-slate-800/60" />
            <div className="bg-zinc-100/80 dark:bg-slate-800/60" />
            <div className="bg-zinc-100/80 dark:bg-slate-800/60" />
          </div>

          {/* Quadrant labels */}
          <span className="absolute top-3 left-3 text-[10px] font-bold text-blue-400/60 uppercase tracking-wide">{t("badge.schedule")}</span>
          <span className="absolute top-3 right-3 text-[10px] font-bold text-red-400/60 uppercase tracking-wide">{t("badge.doFirst")}</span>
          <span className="absolute bottom-3 left-3 text-[10px] font-bold text-zinc-400/60 uppercase tracking-wide">{t("badge.eliminate")}</span>
          <span className="absolute bottom-3 right-3 text-[10px] font-bold text-amber-400/60 uppercase tracking-wide">{t("badge.delegate")}</span>

          {/* Dots */}
          {todos.map((todo) => {
            const x = urgencyScore(todo);
            const y = importanceScore(todo);
            const q = classify(todo);
            const isHovered = hoveredId === todo.id;
            const badge = PRIORITY_BADGES[todo.priority];
            const dl = todo.deadline ? deadlineLabel(todo.deadline, t) : null;

            return (
              <div
                key={todo.id}
                className={`absolute ${isHovered ? "z-50" : "z-10"}`}
                style={{
                  left: `${x}%`,
                  bottom: `${y}%`,
                  transform: "translate(-50%, 50%)",
                }}
                onMouseEnter={() => setHoveredId(todo.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* Dot */}
                <div
                  className={`rounded-full border-2 border-white shadow-md cursor-pointer transition-transform ${DOT_COLORS[q]} ${
                    isHovered ? "scale-150 ring-2 ring-offset-1 ring-zinc-400" : "hover:scale-125"
                  }`}
                  style={{ width: 14, height: 14 }}
                />

                {/* Tooltip */}
                {isHovered && (
                  <ScatterTooltip x={x} y={y} todo={todo} badge={badge} quadrant={q} dl={dl} subtaskCount={subtaskCounts[todo.id] ?? 0} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Scatter Tooltip (smart positioning) ── */
function ScatterTooltip({
  x,
  y,
  todo,
  badge,
  quadrant,
  dl,
  subtaskCount = 0,
}: {
  x: number;
  y: number;
  todo: Todo;
  badge: { label: string; tKey: TranslationKey; cls: string };
  quadrant: Quadrant;
  dl: { text: string; cls: string } | null;
  subtaskCount?: number;
}) {
  const { t } = useLocale();
  const showBelow = y > 75;
  const alignRight = x > 75;
  const alignLeft = x < 25;

  const verticalStyle: React.CSSProperties = showBelow
    ? { top: "calc(100% + 10px)" }
    : { bottom: "calc(100% + 10px)" };

  const horizontalStyle: React.CSSProperties = alignRight
    ? { right: -8 }
    : alignLeft
      ? { left: -8 }
      : { left: "50%", transform: "translateX(-50%)" };

  const arrowPosition = alignRight
    ? "right-3"
    : alignLeft
      ? "left-3"
      : "left-1/2 -translate-x-1/2";

  return (
    <div
      className="absolute z-50 bg-zinc-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded shadow-xl px-4 py-3 text-xs w-56 pointer-events-none"
      style={{ ...verticalStyle, ...horizontalStyle }}
    >
      <p className="font-semibold text-sm mb-1.5">{todo.title}</p>
      <div className="flex flex-wrap items-center gap-1.5 mb-1">
        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${badge.cls}`}>
          {t(badge.tKey)}
        </span>
        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${EFFORT_BADGES[todo.effort ?? "medium"].cls}`}>
          {t(EFFORT_BADGES[todo.effort ?? "medium"].tKey)}
        </span>
        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${QUADRANT_BADGES[quadrant].cls}`}>
          {t(QUADRANT_BADGES[quadrant].tKey)}
        </span>
        {dl && <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${dl.cls}`}>{dl.text}</span>}
        {subtaskCount > 0 && <SubtaskBadge count={subtaskCount} />}
      </div>
      {/* Arrow */}
      <div
        className={`absolute ${arrowPosition} w-0 h-0 ${showBelow ? "bottom-full" : "top-full"}`}
        style={{
          borderLeft: "6px solid transparent",
          borderRight: "6px solid transparent",
          ...(showBelow
            ? { borderBottom: "6px solid rgb(24 24 27)" }
            : { borderTop: "6px solid rgb(24 24 27)" }),
        }}
      />
    </div>
  );
}

/* ── Sort Arrow ── */
function SortArrow({ col, activeCol, dir }: { col: SortColumn; activeCol: SortColumn; dir: SortDirection }) {
  const active = col === activeCol;
  return (
    <span className="inline-flex flex-col ml-1 leading-none">
      <svg className={`w-3 h-3 ${active && dir === "asc" ? "text-zinc-900" : "text-zinc-300"}`} viewBox="0 0 12 12" fill="currentColor">
        <path d="M6 2L10 7H2L6 2Z" />
      </svg>
      <svg className={`w-3 h-3 -mt-1 ${active && dir === "desc" ? "text-zinc-900" : "text-zinc-300"}`} viewBox="0 0 12 12" fill="currentColor">
        <path d="M6 10L2 5H10L6 10Z" />
      </svg>
    </span>
  );
}

/* ── Task List (sortable table) ── */
function TaskList({
  todos,
  allTodos,
  sortCol,
  sortDir,
  onSort,
  onComplete,
  onCancel,
  onDelete,
  onEdit,
  onSubtask,
}: {
  todos: Todo[];
  allTodos: Todo[];
  sortCol: SortColumn;
  sortDir: SortDirection;
  onSort: (col: SortColumn) => void;
  onComplete: (t: Todo) => void;
  onCancel: (t: Todo) => void;
  onDelete: (t: Todo) => void;
  onEdit: (t: Todo) => void;
  onSubtask: (t: Todo) => void;
}) {
  const { t } = useLocale();
  const sorted = sortTodos(todos, sortCol, sortDir);
  const subtasksOf = (id: string) => allTodos.filter(t => t.parentId === id);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const thBtn = "flex items-center gap-0.5 cursor-pointer select-none hover:text-zinc-900 transition-colors";

  return (
    <div>
      <div className="bg-white dark:bg-slate-900 rounded-md shadow-sm border border-zinc-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-slate-700 bg-zinc-50/80 dark:bg-slate-800/80">
              <th className="w-20 px-4 py-3 text-left font-semibold text-zinc-600 dark:text-slate-400 text-xs">{t("table.actions")}</th>
              <th className="text-left px-4 py-3 font-semibold text-zinc-600 dark:text-slate-400">{t("table.title")}</th>
              <th className="text-left px-4 py-3 font-semibold text-zinc-600 dark:text-slate-400 w-28">
                <button type="button" className={thBtn} onClick={() => onSort("priority")}>
                  {t("table.priority")} <SortArrow col="priority" activeCol={sortCol} dir={sortDir} />
                </button>
              </th>
              <th className="text-left px-4 py-3 font-semibold text-zinc-600 dark:text-slate-400 w-32">
                {t("table.effort")}
              </th>
              <th className="text-left px-4 py-3 font-semibold text-zinc-600 dark:text-slate-400 w-36">
                <button type="button" className={thBtn} onClick={() => onSort("deadline")}>
                  {t("table.deadline")} <SortArrow col="deadline" activeCol={sortCol} dir={sortDir} />
                </button>
              </th>
              <th className="text-left px-4 py-3 font-semibold text-zinc-600 dark:text-slate-400 w-36">
                <button type="button" className={thBtn} onClick={() => onSort("classification")}>
                  {t("table.classification")} <SortArrow col="classification" activeCol={sortCol} dir={sortDir} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-zinc-400 italic">
                  {t("matrix.empty")}
                </td>
              </tr>
            ) : (
              sorted.map((todo) => {
                const badge = PRIORITY_BADGES[todo.priority];
                const qBadge = QUADRANT_BADGES[classify(todo)];
                const dl = todo.deadline ? deadlineLabel(todo.deadline, t) : null;
                const isArchived = todo.status !== "active";

                const subs = subtasksOf(todo.id);
                return (<Fragment key={todo.id}>
                  <tr
                    onDoubleClick={(e) => { e.preventDefault(); onEdit(todo); }}
                    className={`border-b border-zinc-100 dark:border-slate-800 last:border-b-0 group hover:bg-zinc-50/60 dark:hover:bg-slate-800/60 transition-colors cursor-pointer select-none ${
                      isArchived ? "opacity-50" : ""
                    }`}
                  >
                    {/* Actions */}
                    <td className="px-4 py-3">
                      {isArchived ? (
                        <button
                          onClick={() => onComplete(todo)}
                          title="Remettre en tâche active"
                          className="inline-flex items-center gap-1 rounded border border-green-300 dark:border-green-700 px-2 py-1 text-[11px] font-medium text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/40 transition-colors"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
                          </svg>
                          {t("todos.reactivate")}
                        </button>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => onComplete(todo)}
                            title="Accomplir"
                            className="w-6 h-6 rounded flex items-center justify-center border border-zinc-300 text-zinc-400 hover:border-green-500 hover:text-green-500"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </button>
                          {!todo.parentId && (
                            <button
                              onClick={() => onSubtask(todo)}
                              className="w-6 h-6 rounded flex items-center justify-center border border-zinc-300 dark:border-slate-600 text-zinc-400 hover:border-blue-500 hover:text-blue-500"
                              title={t("subtask.add")}
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                              </svg>
                            </button>
                          )}
                          <button
                            onClick={() => onCancel(todo)}
                            title="Annuler"
                            className="w-6 h-6 rounded flex items-center justify-center border border-zinc-300 text-zinc-400 hover:border-zinc-500 hover:text-zinc-500"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            </svg>
                          </button>
                          <button
                            onClick={() => onDelete(todo)}
                            title="Supprimer"
                            className="w-6 h-6 rounded flex items-center justify-center border border-transparent text-zinc-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </td>
                    {/* Title */}
                    <td className="px-4 py-3">
                      <span className={`font-medium ${
                        todo.status === "completed" ? "line-through text-zinc-400" :
                        todo.status === "cancelled" ? "line-through text-zinc-400 italic" :
                        todo.status === "deleted" ? "line-through text-zinc-300 dark:text-slate-600" :
                        "text-zinc-900 dark:text-slate-100"
                      }`}>
                        {todo.title}
                      </span>
                      {subtasksOf(todo.id).length > 0 && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleExpand(todo.id); }}
                          className={`ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded transition-colors hover:bg-indigo-600 ${SUBTASK_BADGE_CLS}`}
                        >
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 5.25h16.5m-16.5-10.5H12" />
                          </svg>
                          {subtasksOf(todo.id).length} {expanded.has(todo.id) ? "▴" : "▾"}
                        </button>
                      )}
                    </td>
                    {/* Priority */}
                    <td className="px-4 py-3">
                      <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${badge.cls}`}>
                        {t(badge.tKey)}
                      </span>
                    </td>
                    {/* Effort */}
                    <td className="px-4 py-3">
                      <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${EFFORT_BADGES[todo.effort ?? "medium"].cls}`}>
                        {t(EFFORT_BADGES[todo.effort ?? "medium"].tKey)}
                      </span>
                    </td>
                    {/* Deadline */}
                    <td className="px-4 py-3">
                      {dl ? (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${dl.cls}`}>{dl.text}</span>
                      ) : (
                        <span className="text-xs text-zinc-300">—</span>
                      )}
                    </td>
                    {/* Classification */}
                    <td className="px-4 py-3">
                      <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded ${qBadge.cls}`}>
                        {t(qBadge.tKey)}
                      </span>
                    </td>
                  </tr>
                  {expanded.has(todo.id) && subtasksOf(todo.id).map((sub) => {
                    const subBadge = PRIORITY_BADGES[sub.priority];
                    const subDl = sub.deadline ? deadlineLabel(sub.deadline, t) : null;
                    return (
                      <tr
                        key={sub.id}
                        className="border-b border-zinc-100 dark:border-slate-800 last:border-b-0 bg-zinc-50/40 dark:bg-slate-800/30"
                      >
                        <td className="px-4 py-2 pl-8">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => onComplete(sub)}
                              className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border ${
                                sub.status === "completed"
                                  ? "bg-green-500 border-green-500 text-white"
                                  : "border-zinc-300 dark:border-slate-500 text-zinc-400 hover:border-green-500 hover:text-green-500"
                              } transition-colors`}
                            >
                              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </button>
                            <button
                              onClick={() => onCancel(sub)}
                              title={t("todos.undo")}
                              className="w-5 h-5 rounded flex items-center justify-center border border-zinc-300 dark:border-slate-600 text-zinc-400 hover:border-zinc-500 hover:text-zinc-500"
                            >
                              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                              </svg>
                            </button>
                            <button
                              onClick={() => onDelete(sub)}
                              className="w-5 h-5 rounded flex items-center justify-center border border-transparent text-zinc-300 hover:text-red-500"
                            >
                              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <span className="text-zinc-400 mr-1.5">↳</span>
                          <span className={`text-sm ${sub.status === "completed" ? "line-through text-zinc-400" : "text-zinc-700 dark:text-slate-300"}`}>
                            {sub.title}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${subBadge.cls}`}>{t(subBadge.tKey)}</span>
                        </td>
                        <td className="px-4 py-2">
                          <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${EFFORT_BADGES[sub.effort ?? "medium"].cls}`}>{t(EFFORT_BADGES[sub.effort ?? "medium"].tKey)}</span>
                        </td>
                        <td className="px-4 py-2">
                          {subDl ? <span className={`text-xs font-semibold px-2 py-0.5 rounded ${subDl.cls}`}>{subDl.text}</span> : <span className="text-xs text-zinc-300">—</span>}
                        </td>
                        <td className="px-4 py-2" />
                      </tr>
                    );
                  })}
                </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Quadrant Cell ── */
function QuadrantCell({
  quadrant,
  todos,
  allTodos = [],
  onComplete,
  onDelete,
  onEdit,
  subtaskCounts = {},
}: {
  quadrant: Quadrant;
  todos: Todo[];
  allTodos?: Todo[];
  onComplete: (t: Todo) => void;
  onDelete: (t: Todo) => void;
  onEdit?: (t: Todo) => void;
  subtaskCounts?: Record<string, number>;
}) {
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

  const subtasksOf = (id: string) => allTodos.filter(st => st.parentId === id);

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
                  <MatrixCard todo={todo} onComplete={onComplete} onDelete={onDelete} onEdit={onEdit} subtaskCount={sc} onToggleSubtasks={sc > 0 ? () => toggleExpand(todo.id) : undefined} subtasksExpanded={expanded.has(todo.id)} />
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

/* ── Matrix Card ── */
function MatrixCard({
  todo,
  onComplete,
  onDelete,
  onEdit,
  subtaskCount = 0,
  onToggleSubtasks,
  subtasksExpanded = false,
}: {
  todo: Todo;
  onComplete: (t: Todo) => void;
  onDelete: (t: Todo) => void;
  onEdit?: (t: Todo) => void;
  subtaskCount?: number;
  onToggleSubtasks?: () => void;
  subtasksExpanded?: boolean;
}) {
  const { t } = useLocale();
  const badge = PRIORITY_BADGES[todo.priority];
  const dl = todo.deadline ? deadlineLabel(todo.deadline, t) : null;

  return (
    <div
      onDoubleClick={(e) => { e.preventDefault(); onEdit?.(todo); }}
      className="group bg-white dark:bg-slate-900/80 rounded border border-zinc-200 dark:border-slate-600/40 pl-1 pr-3 py-2.5 flex items-start gap-2.5 shadow-sm hover:shadow transition-shadow cursor-pointer select-none"
    >
      <div className={`w-1 self-stretch rounded-full shrink-0 ${QUADRANT_CONFIG[classify(todo)].accentBar}`} />
      {todo.status !== "active" ? (
        <button
          onClick={() => onComplete(todo)}
          title="Remettre en tâche active"
          className="mt-0.5 shrink-0 inline-flex items-center gap-0.5 rounded border border-green-300 dark:border-green-700 px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/40 transition-colors"
        >
          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
          </svg>
          {t("todos.reactivate")}
        </button>
      ) : (
        <button
          onClick={() => onComplete(todo)}
          className="mt-0.5 w-[18px] h-[18px] rounded flex items-center justify-center shrink-0 border-2 border-zinc-300 dark:border-slate-500 hover:border-green-500 hover:text-green-500"
          aria-label="Accomplir"
        >
          <svg className="w-2.5 h-2.5 text-zinc-300 dark:text-slate-600 group-hover:text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </button>
      )}
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug font-medium truncate ${todo.status !== "active" ? "line-through text-zinc-400" : "text-zinc-900 dark:text-slate-100"}`}>{todo.title}</p>
        <div className="flex items-center gap-1 mt-1 flex-nowrap">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap ${badge.cls}`}>{t(badge.tKey)}</span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap ${EFFORT_BADGES[todo.effort ?? "medium"].cls}`}>{t(EFFORT_BADGES[todo.effort ?? "medium"].tKey)}</span>
          {dl && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap ${dl.cls}`}>{dl.text}</span>}
          {subtaskCount > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleSubtasks?.(); }}
              className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap transition-colors ${SUBTASK_BADGE_CLS} hover:bg-indigo-600`}
            >
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 5.25h16.5m-16.5-10.5H12" />
              </svg>
              {subtaskCount} {subtasksExpanded ? "▴" : "▾"}
            </button>
          )}
        </div>
      </div>
      {todo.status === "active" && (
        <button
          onClick={() => onDelete(todo)}
          className="text-zinc-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 shrink-0 mt-0.5"
          aria-label="Supprimer"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}
    </div>
  );
}
