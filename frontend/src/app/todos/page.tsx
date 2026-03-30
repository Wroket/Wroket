"use client";

import { FormEvent, Fragment, useEffect, useMemo, useRef, useState } from "react";

import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthContext";
import ConfirmDialog from "@/components/ConfirmDialog";
import EisenhowerRadar from "@/components/EisenhowerRadar";
import SlotPicker, { ScheduledSlotBadge } from "@/components/SlotPicker";
import SubtaskModal from "@/components/SubtaskModal";
import TaskEditModal from "@/components/TaskEditModal";
import TodoCard from "@/components/TodoCard";
import { useToast } from "@/components/Toast";
import {
  createTodo,
  deleteTodo,
  getTodos,
  getAssignedTodos,
  getProjects,
  updateTodo,
  lookupUser,
  Todo,
  Priority,
  Effort,
  TodoStatus,
  AuthMeResponse,
  Project,
} from "@/lib/api";
import { classify } from "@/lib/classify";
import { deadlineLabel } from "@/lib/deadlineUtils";
import { EFFORT_BADGES } from "@/lib/effortBadges";
import type { TranslationKey } from "@/lib/i18n";
import { useLocale } from "@/lib/LocaleContext";
import {
  QUADRANT_CONFIG,
  PRIORITY_BADGES,
  SUBTASK_BADGE_CLS,
  type Quadrant,
  type FilterKey,
  type SortColumn,
  type SortDirection,
} from "@/lib/todoConstants";
import { useUserLookup } from "@/lib/userUtils";

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

const QUADRANT_BADGES: Record<Quadrant, { label: string; tKey: TranslationKey; cls: string }> = {
  "do-first": { label: "🔥 Faire", tKey: "badge.doFirst" as const, cls: "bg-red-500 text-white dark:bg-red-600" },
  schedule: { label: "📅 Planifier", tKey: "badge.schedule" as const, cls: "bg-blue-500 text-white dark:bg-blue-600" },
  delegate: { label: "⚡ Expédier", tKey: "badge.delegate" as const, cls: "bg-amber-500 text-white dark:bg-amber-600" },
  eliminate: { label: "⏸️ Différer", tKey: "badge.eliminate" as const, cls: "bg-emerald-400 text-white dark:bg-emerald-600" },
};

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

const QUADRANT_RANK: Record<Quadrant, number> = {
  "do-first": 1, schedule: 2, delegate: 3, eliminate: 4,
};
const PRIORITY_RANK: Record<Priority, number> = {
  high: 1, medium: 2, low: 3,
};

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
  const { user } = useAuth();
  const meUid = user?.uid ?? null;
  const { resolveUser, displayName: userDisplayName, cache: userCache } = useUserLookup();
  const { toast } = useToast();

  const [myTodos, setMyTodos] = useState<Todo[]>([]);
  const [assignedTodos, setAssignedTodos] = useState<Todo[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  type TaskScope = "all" | "personal" | "assigned";
  const [scope, setScope] = useState<TaskScope>("all");

  const todos = useMemo(() => {
    const personal = myTodos.filter((t) => !t.assignedTo || t.assignedTo === meUid);
    if (scope === "personal") return personal;
    if (scope === "assigned") return assignedTodos;
    const seen = new Set<string>();
    const all: Todo[] = [];
    for (const t of [...personal, ...assignedTodos]) {
      if (!seen.has(t.id)) { seen.add(t.id); all.push(t); }
    }
    return all;
  }, [myTodos, assignedTodos, scope, meUid]);

  const setTodos = (updater: (prev: Todo[]) => Todo[]) => {
    setMyTodos(updater);
    setAssignedTodos(updater);
  };

  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [priorityTouched, setPriorityTouched] = useState(false);
  const [effort, setEffort] = useState<Effort>("medium");
  const [effortTouched, setEffortTouched] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<"priority" | "effort" | null>(null);
  const [deadline, setDeadline] = useState("");
  const [assignEmail, setAssignEmail] = useState("");
  const [assignedUser, setAssignedUser] = useState<AuthMeResponse | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [filters, setFilters] = useState<Set<FilterKey>>(new Set());
  const [filterProject, setFilterProject] = useState<string | "__none__" | null>(null);
  const [filterAssignee, setFilterAssignee] = useState<string | "__unassigned__" | null>(null);
  type DeadlineFilter = "all" | "today" | "week" | "overdue" | "none";
  const [filterDeadline, setFilterDeadline] = useState<DeadlineFilter>("all");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [sortCol, setSortCol] = useState<SortColumn>("classification");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");
  const [lastAction, setLastAction] = useState<{ todoId: string; previousStatus: TodoStatus } | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [mainView, setMainView] = useState<"list" | "cards" | "radar">("list");
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [editForm, setEditForm] = useState({ title: "", priority: "medium" as Priority, effort: "medium" as Effort, deadline: "", assignedTo: "" as string | null, estimatedMinutes: null as number | null });
  const [editAssignEmail, setEditAssignEmail] = useState("");
  const [editAssignedUser, setEditAssignedUser] = useState<AuthMeResponse | null>(null);
  const [editAssignError, setEditAssignError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const [subtaskParent, setSubtaskParent] = useState<Todo | null>(null);
  const [subtaskSubmitting, setSubtaskSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Todo | null>(null);
  const assignLookupTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const editAssignLookupTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const openEdit = (todo: Todo) => {
    setEditingTodo(todo);
    setEditForm({
      title: todo.title,
      priority: todo.priority,
      effort: todo.effort ?? "medium",
      deadline: todo.deadline ?? "",
      assignedTo: todo.assignedTo ?? null,
      estimatedMinutes: todo.estimatedMinutes ?? null,
    });
    setEditAssignEmail("");
    setEditAssignedUser(null);
    setEditAssignError(null);
    if (todo.assignedTo && !userCache[todo.assignedTo]) {
      resolveUser(todo.assignedTo);
    }
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
        assignedTo: editForm.assignedTo,
        estimatedMinutes: editForm.estimatedMinutes,
      });
      setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setEditingTodo(null);
      toast.success("Tâche mise à jour");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de la sauvegarde");
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
    if (!meUid) return;
    let cancelled = false;
    (async () => {
      try {
        const [mine, assigned, projs] = await Promise.all([
          getTodos(),
          getAssignedTodos(),
          getProjects(),
        ]);
        if (!cancelled) {
          setMyTodos(mine);
          setAssignedTodos(assigned);
          setProjects(projs.filter((p) => p.status === "active"));
          const uids = new Set<string>();
          [...mine, ...assigned].forEach((todo) => {
            if (todo.assignedTo) uids.add(todo.assignedTo);
            if (todo.userId && todo.userId !== meUid) uids.add(todo.userId);
          });
          uids.forEach((uid) => resolveUser(uid));
        }
      } catch {
        /* auth handled by AppShell */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [meUid, resolveUser]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const todo = await createTodo({
        title,
        priority,
        effort,
        deadline: deadline || null,
        projectId: selectedProjectId,
        assignedTo: assignedUser?.uid ?? null,
      });
      setMyTodos((prev) => [todo, ...prev]);
      setTitle("");
      setDeadline("");
      setPriority("medium");
      setPriorityTouched(false);
      setEffort("medium");
      setEffortTouched(false);
      setAssignEmail("");
      setAssignedUser(null);
      setAssignError(null);
      setSelectedProjectId(null);
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
    } catch {
      toast.error("Erreur lors de la mise à jour");
    }
  };

  const requestDelete = (todo: Todo) => {
    if (todo.status === "deleted") {
      performDelete(todo);
    } else {
      setConfirmDelete(todo);
    }
  };

  const performDelete = async (todo: Todo) => {
    setConfirmDelete(null);
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
    } catch {
      toast.error("Erreur lors de la suppression");
    }
  };

  const handleDecline = async (todo: Todo) => {
    try {
      const updated = await updateTodo(todo.id, { assignmentStatus: "declined" });
      setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch {
      toast.error("Erreur lors du refus");
    }
  };

  const handleAccept = async (todo: Todo) => {
    try {
      const updated = await updateTodo(todo.id, { assignmentStatus: "accepted" });
      setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch {
      toast.error("Erreur lors de l'acceptation");
    }
  };

  const handleUndo = async () => {
    if (!lastAction || undoing) return;
    setUndoing(true);
    try {
      const updated = await updateTodo(lastAction.todoId, { status: lastAction.previousStatus });
      setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setLastAction(null);
    } catch {
      toast.error("Erreur lors de l'annulation");
    } finally {
      setUndoing(false);
    }
  };

  const getSubtasks = (parentId: string) => todos.filter(t => t.parentId === parentId);

  const handleCreateSubtask = async (data: { title: string; priority: Priority; effort: Effort; deadline: string }) => {
    if (!subtaskParent) return;
    setSubtaskSubmitting(true);
    try {
      const todo = await createTodo({
        title: data.title,
        priority: data.priority,
        effort: data.effort,
        deadline: data.deadline || null,
        parentId: subtaskParent.id,
      });
      setMyTodos(prev => [todo, ...prev]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSubtaskSubmitting(false);
    }
  };

  const handleAssignLookup = (email: string) => {
    setAssignEmail(email);
    setAssignError(null);
    clearTimeout(assignLookupTimer.current);
    if (!email.includes("@") || email.length < 5) {
      setAssignedUser(null);
      return;
    }
    assignLookupTimer.current = setTimeout(async () => {
      try {
        const u = await lookupUser(email);
        if (u) {
          setAssignedUser(u);
          setAssignError(null);
        } else {
          setAssignedUser(null);
          setAssignError(t("assign.userNotFound"));
        }
      } catch {
        setAssignedUser(null);
      }
    }, 300);
  };

  const handleEditAssignLookup = (email: string) => {
    setEditAssignEmail(email);
    setEditAssignError(null);
    clearTimeout(editAssignLookupTimer.current);
    if (!email.includes("@") || email.length < 5) {
      setEditAssignedUser(null);
      return;
    }
    editAssignLookupTimer.current = setTimeout(async () => {
      try {
        const u = await lookupUser(email);
        if (u) {
          setEditAssignedUser(u);
          setEditAssignError(null);
          setEditForm((f) => ({ ...f, assignedTo: u.uid }));
        } else {
          setEditAssignedUser(null);
          setEditAssignError(t("assign.userNotFound"));
        }
      } catch {
        setEditAssignedUser(null);
      }
    }, 300);
  };

  const openSubtaskModal = (todo: Todo) => {
    setSubtaskParent(todo);
  };

  const hasAdvancedFilters = filterProject !== null || filterAssignee !== null || filterDeadline !== "all";

  const advancedFiltered = useMemo(() => {
    if (!hasAdvancedFilters) return todos;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const endOfWeek = new Date(now);
    endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
    endOfWeek.setHours(23, 59, 59, 999);

    return todos.filter((t) => {
      if (filterProject === "__none__") {
        if (t.projectId) return false;
      } else if (filterProject) {
        if (t.projectId !== filterProject) return false;
      }

      if (filterAssignee === "__unassigned__") {
        if (t.assignedTo) return false;
      } else if (filterAssignee) {
        if (t.assignedTo !== filterAssignee) return false;
      }

      if (filterDeadline !== "all") {
        if (filterDeadline === "none") {
          if (t.deadline) return false;
        } else if (!t.deadline) {
          return false;
        } else {
          const dl = new Date(t.deadline);
          if (filterDeadline === "today" && dl > endOfToday) return false;
          if (filterDeadline === "week" && dl > endOfWeek) return false;
          if (filterDeadline === "overdue" && dl >= now) return false;
        }
      }

      return true;
    });
  }, [todos, filterProject, filterAssignee, filterDeadline, hasAdvancedFilters]);

  const activeTodos = useMemo(() => advancedFiltered.filter((t) => t.status === "active" && !t.parentId), [advancedFiltered]);
  const completedTodos = useMemo(() => advancedFiltered.filter((t) => t.status === "completed" && !t.parentId), [advancedFiltered]);
  const cancelledTodos = useMemo(() => advancedFiltered.filter((t) => t.status === "cancelled" && !t.parentId), [advancedFiltered]);
  const deletedTodos = useMemo(() => advancedFiltered.filter((t) => t.status === "deleted" && !t.parentId), [advancedFiltered]);

  const grouped = useMemo<Record<Quadrant, Todo[]>>(() => ({
    "do-first": activeTodos.filter((t) => classify(t) === "do-first"),
    schedule: activeTodos.filter((t) => classify(t) === "schedule"),
    delegate: activeTodos.filter((t) => classify(t) === "delegate"),
    eliminate: activeTodos.filter((t) => classify(t) === "eliminate"),
  }), [activeTodos]);

  const subtaskCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const td of todos) {
      if (td.parentId) counts[td.parentId] = (counts[td.parentId] ?? 0) + 1;
    }
    return counts;
  }, [todos]);

  const uniqueAssignees = useMemo(() => {
    const uids = new Set<string>();
    for (const t of todos) {
      if (t.assignedTo) uids.add(t.assignedTo);
    }
    return Array.from(uids);
  }, [todos]);

  const filterCounts = useMemo<Record<FilterKey, number>>(() => ({
    "do-first": grouped["do-first"].length,
    schedule: grouped.schedule.length,
    delegate: grouped.delegate.length,
    eliminate: grouped.eliminate.length,
    completed: completedTodos.length,
    cancelled: cancelledTodos.length,
    deleted: deletedTodos.length,
  }), [grouped, completedTodos, cancelledTodos, deletedTodos]);

  const QUADRANT_KEYS: Quadrant[] = ["do-first", "schedule", "delegate", "eliminate"];
  const STATUS_KEYS: FilterKey[] = ["completed", "cancelled", "deleted"];

  const toggleFilter = (key: FilterKey) => {
    setFilters((prev) => {
      const next = new Set(prev);
      const isStatus = STATUS_KEYS.includes(key);

      if (next.has(key)) {
        next.delete(key);
      } else {
        if (isStatus) {
          for (const sk of STATUS_KEYS) next.delete(sk);
        }
        next.add(key);
      }
      return next;
    });
  };

  const listTodos = useMemo(() => {
    if (filters.size === 0) return activeTodos;
    const parts: Todo[][] = [];
    for (const f of filters) {
      if (f === "completed") parts.push(completedTodos);
      else if (f === "cancelled") parts.push(cancelledTodos);
      else if (f === "deleted") parts.push(deletedTodos);
      else parts.push(grouped[f]);
    }
    return parts.flat();
  }, [filters, activeTodos, completedTodos, cancelledTodos, deletedTodos, grouped]);

  const activeQuadrantFilters = QUADRANT_KEYS.filter((k) => filters.has(k));
  const activeStatusFilters = STATUS_KEYS.filter((k) => filters.has(k));

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <span className="animate-pulse text-zinc-400 dark:text-slate-500 text-sm">{t("loading")}</span>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-[1400px] space-y-6">
        {/* ── Create form ── */}
        <form
          onSubmit={handleCreate}
          className="bg-white dark:bg-slate-900 rounded-md shadow-sm border border-zinc-200 dark:border-slate-700 p-5"
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder={t("todos.addPlaceholder")}
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="flex-1 min-w-0 rounded border border-zinc-300 dark:border-slate-600 px-4 py-2.5 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 placeholder:text-zinc-400 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400"
              />
              <button
                type="submit"
                disabled={submitting}
                className="rounded bg-slate-700 dark:bg-slate-100 px-6 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-300 disabled:opacity-60 whitespace-nowrap transition-colors h-[42px] shrink-0"
              >
                {submitting ? t("todos.adding") : t("todos.add")}
              </button>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
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
                className="shrink-0 rounded border border-zinc-300 dark:border-slate-600 px-3 py-2.5 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400 h-[42px]"
              />
              <div className="relative flex-1 min-w-0">
                <input
                  type="email"
                  placeholder={t("assign.placeholder")}
                  value={assignEmail}
                  onChange={(e) => handleAssignLookup(e.target.value)}
                  className={`w-full rounded border px-3 py-2.5 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:outline-none focus:ring-1 h-[42px] ${
                    assignedUser
                      ? "border-green-400 dark:border-green-600 focus:border-green-500 focus:ring-green-500"
                      : assignError
                        ? "border-red-400 dark:border-red-600 focus:border-red-500 focus:ring-red-500"
                        : "border-zinc-300 dark:border-slate-600 focus:border-slate-700 dark:focus:border-slate-400 focus:ring-slate-700 dark:focus:ring-slate-400"
                  }`}
                />
                {assignedUser && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-green-500">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                )}
              </div>
              {projects.length > 0 && (
                <select
                  value={selectedProjectId ?? ""}
                  onChange={(e) => setSelectedProjectId(e.target.value || null)}
                  className="shrink-0 rounded border border-zinc-300 dark:border-slate-600 px-3 py-2.5 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400 h-[42px]"
                >
                  <option value="">{t("projects.noProject" as TranslationKey)}</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
          {formError && (
            <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {formError}
            </p>
          )}
        </form>

        {/* ── Filters panel (collapsible) ── */}
        <div className="rounded-md border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdvancedFilters((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 text-zinc-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
              </svg>
              {t("filter.panelTitle")}
              {(filters.size > 0 || hasAdvancedFilters) && (
                <span className="inline-flex items-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold px-1.5 py-0.5">
                  {filters.size + (filterProject !== null ? 1 : 0) + (filterAssignee !== null ? 1 : 0) + (filterDeadline !== "all" ? 1 : 0)}
                </span>
              )}
            </span>
            <svg className={`w-4 h-4 text-zinc-400 dark:text-slate-500 transition-transform ${showAdvancedFilters ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>

          {showAdvancedFilters && (
            <div className="px-3 pb-3 pt-1 border-t border-zinc-100 dark:border-slate-700/50 space-y-3">
              <p className="text-[11px] text-zinc-400 dark:text-slate-500 leading-snug">
                {t("filter.panelHint")}
              </p>

              <div className="flex flex-wrap items-end gap-3">
                {/* Classification */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium text-zinc-500 dark:text-slate-400 uppercase tracking-wider">{t("filter.sectionClassification")}</span>
                  <select
                    value={[...filters].find((f) => QUADRANT_KEYS.includes(f as Quadrant)) ?? ""}
                    onChange={(e) => {
                      setFilters((prev) => {
                        const next = new Set(prev);
                        for (const qk of QUADRANT_KEYS) next.delete(qk as FilterKey);
                        if (e.target.value) next.add(e.target.value as FilterKey);
                        return next;
                      });
                    }}
                    className="rounded border border-zinc-200 dark:border-slate-600 bg-zinc-50 dark:bg-slate-800 text-zinc-700 dark:text-slate-300 text-xs px-2 py-1.5 pr-6 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  >
                    <option value="">{t("filter.allClassifications")}</option>
                    {FILTER_BUTTONS.filter((b) => QUADRANT_KEYS.includes(b.key as Quadrant)).map((btn) => (
                      <option key={btn.key} value={btn.key}>{btn.icon} {t(btn.tKey)} ({filterCounts[btn.key]})</option>
                    ))}
                  </select>
                </div>

                {/* Status */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium text-zinc-500 dark:text-slate-400 uppercase tracking-wider">{t("filter.sectionStatus")}</span>
                  <select
                    value={[...filters].find((f) => STATUS_KEYS.includes(f)) ?? ""}
                    onChange={(e) => {
                      setFilters((prev) => {
                        const next = new Set(prev);
                        for (const sk of STATUS_KEYS) next.delete(sk);
                        if (e.target.value) next.add(e.target.value as FilterKey);
                        return next;
                      });
                    }}
                    className="rounded border border-zinc-200 dark:border-slate-600 bg-zinc-50 dark:bg-slate-800 text-zinc-700 dark:text-slate-300 text-xs px-2 py-1.5 pr-6 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  >
                    <option value="">{t("filter.activeOnly")}</option>
                    {FILTER_BUTTONS.filter((b) => STATUS_KEYS.includes(b.key)).map((btn) => (
                      <option key={btn.key} value={btn.key}>{btn.icon} {t(btn.tKey)} ({filterCounts[btn.key]})</option>
                    ))}
                  </select>
                </div>

                {/* Project */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium text-zinc-500 dark:text-slate-400 uppercase tracking-wider">{t("filter.byProject")}</span>
                  <select
                    value={filterProject ?? ""}
                    onChange={(e) => setFilterProject(e.target.value || null)}
                    className="rounded border border-zinc-200 dark:border-slate-600 bg-zinc-50 dark:bg-slate-800 text-zinc-700 dark:text-slate-300 text-xs px-2 py-1.5 pr-6 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  >
                    <option value="">{t("filter.allProjects")}</option>
                    <option value="__none__">{t("filter.noProject")}</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {/* Assignee */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium text-zinc-500 dark:text-slate-400 uppercase tracking-wider">{t("filter.byAssignee")}</span>
                  <select
                    value={filterAssignee ?? ""}
                    onChange={(e) => setFilterAssignee(e.target.value || null)}
                    className="rounded border border-zinc-200 dark:border-slate-600 bg-zinc-50 dark:bg-slate-800 text-zinc-700 dark:text-slate-300 text-xs px-2 py-1.5 pr-6 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  >
                    <option value="">{t("filter.allAssignees")}</option>
                    <option value="__unassigned__">{t("filter.unassigned")}</option>
                    {uniqueAssignees.map((uid) => (
                      <option key={uid} value={uid}>{userDisplayName(uid)}</option>
                    ))}
                  </select>
                </div>

                {/* Deadline */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium text-zinc-500 dark:text-slate-400 uppercase tracking-wider">{t("filter.byDeadline")}</span>
                  <select
                    value={filterDeadline}
                    onChange={(e) => setFilterDeadline(e.target.value as DeadlineFilter)}
                    className="rounded border border-zinc-200 dark:border-slate-600 bg-zinc-50 dark:bg-slate-800 text-zinc-700 dark:text-slate-300 text-xs px-2 py-1.5 pr-6 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  >
                    <option value="all">{t("filter.allDeadlines")}</option>
                    <option value="today">{t("filter.deadlineToday")}</option>
                    <option value="week">{t("filter.deadlineWeek")}</option>
                    <option value="overdue">{t("filter.deadlineOverdue")}</option>
                    <option value="none">{t("filter.deadlineNone")}</option>
                  </select>
                </div>
              </div>

              {/* Clear all */}
              {(filters.size > 0 || hasAdvancedFilters) && (
                <div className="pt-1 border-t border-zinc-100 dark:border-slate-700/50">
                  <button
                    type="button"
                    onClick={() => { setFilters(new Set()); setFilterProject(null); setFilterAssignee(null); setFilterDeadline("all"); }}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                  >
                    {t("filter.clearAll")}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Main view (List / Cards / Radar) ── */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-base font-semibold text-zinc-700 dark:text-slate-300 tracking-wide uppercase">
                {mainView === "list" ? t("todos.listTitle") : t("todos.matrixTitle")}
              </h2>
              <div className="flex rounded border border-zinc-200 dark:border-slate-600 overflow-hidden">
                {(["all", "personal", "assigned"] as TaskScope[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScope(s)}
                    className={`px-3 py-1 text-xs font-medium transition-colors ${
                      scope === s
                        ? "bg-slate-700 dark:bg-slate-100 text-white dark:text-slate-900"
                        : "text-zinc-500 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800"
                    } ${s !== "all" ? "border-l border-zinc-200 dark:border-slate-600" : ""}`}
                  >
                    {t(`scope.${s}` as TranslationKey)}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleUndo}
                disabled={!lastAction || undoing}
                title={t("todos.undoTitle")}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
                  lastAction
                    ? "border-zinc-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-700"
                    : "border-zinc-100 dark:border-slate-700 bg-zinc-50 dark:bg-slate-800/50 text-zinc-300 dark:text-slate-600 cursor-not-allowed"
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
                </svg>
                <span className="hidden sm:inline">{t("todos.undo")}</span>
              </button>
              <span className="text-sm text-zinc-400 hidden sm:inline">
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
                      ? "bg-slate-700 dark:bg-slate-100 text-white dark:text-slate-900"
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
                      ? "bg-slate-700 dark:bg-slate-100 text-white dark:text-slate-900"
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
                      ? "bg-slate-700 dark:bg-slate-100 text-white dark:text-slate-900"
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
              meUid={meUid}
              userDisplayName={userDisplayName}
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
              onDelete={(t) => requestDelete(t)}
              onEdit={openEdit}
              onSubtask={openSubtaskModal}
              onDecline={handleDecline}
              onAccept={handleAccept}
              projects={projects}
              onScheduleUpdate={(updated) => setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))}
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
                        <TodoCard key={todo.id} todo={todo} onComplete={(t) => handleStatusChange(t, t.status === "completed" ? "active" : "completed")} onDelete={(t) => requestDelete(t)} onDecline={handleDecline} onAccept={handleAccept} onEdit={openEdit} onScheduleUpdate={(updated) => setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))} subtaskCount={getSubtasks(todo.id).length} meUid={meUid} userDisplayName={userDisplayName} />
                      ))}
                    </div>
                  )}
                </div>
              ) : filters.size > 0 && activeQuadrantFilters.length > 0 ? (
                /* Quadrant filters: show selected quadrants expanded */
                <div className={`grid gap-2 ${activeQuadrantFilters.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
                  {activeQuadrantFilters.map((q) => (
                    <div key={q} className="rounded overflow-hidden">
                      <QuadrantCell quadrant={q} todos={grouped[q]} allTodos={todos} onComplete={(t) => handleStatusChange(t, "completed")} onDelete={(t) => requestDelete(t)} onDecline={handleDecline} onAccept={handleAccept} onEdit={openEdit} onScheduleUpdate={(updated) => setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))} subtaskCounts={subtaskCounts} meUid={meUid} userDisplayName={userDisplayName} />
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
                          <TodoCard key={todo.id} todo={todo} onComplete={(t) => handleStatusChange(t, t.status === "completed" ? "active" : "completed")} onDelete={(t) => requestDelete(t)} onDecline={handleDecline} onAccept={handleAccept} onEdit={openEdit} onScheduleUpdate={(updated) => setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))} subtaskCount={getSubtasks(todo.id).length} meUid={meUid} userDisplayName={userDisplayName} />
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
                      <QuadrantCell quadrant="schedule" todos={grouped.schedule} allTodos={todos} onComplete={(t) => handleStatusChange(t, "completed")} onDelete={(t) => requestDelete(t)} onDecline={handleDecline} onAccept={handleAccept} onEdit={openEdit} onScheduleUpdate={(updated) => setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))} subtaskCounts={subtaskCounts} meUid={meUid} userDisplayName={userDisplayName} />
                    </div>
                    <div className="rounded overflow-hidden">
                      <QuadrantCell quadrant="do-first" todos={grouped["do-first"]} allTodos={todos} onComplete={(t) => handleStatusChange(t, "completed")} onDelete={(t) => requestDelete(t)} onDecline={handleDecline} onAccept={handleAccept} onEdit={openEdit} onScheduleUpdate={(updated) => setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))} subtaskCounts={subtaskCounts} meUid={meUid} userDisplayName={userDisplayName} />
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
                      <QuadrantCell quadrant="eliminate" todos={grouped.eliminate} allTodos={todos} onComplete={(t) => handleStatusChange(t, "completed")} onDelete={(t) => requestDelete(t)} onDecline={handleDecline} onAccept={handleAccept} onEdit={openEdit} onScheduleUpdate={(updated) => setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))} subtaskCounts={subtaskCounts} meUid={meUid} userDisplayName={userDisplayName} />
                    </div>
                    <div className="rounded overflow-hidden">
                      <QuadrantCell quadrant="delegate" todos={grouped.delegate} allTodos={todos} onComplete={(t) => handleStatusChange(t, "completed")} onDelete={(t) => requestDelete(t)} onDecline={handleDecline} onAccept={handleAccept} onEdit={openEdit} onScheduleUpdate={(updated) => setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))} subtaskCounts={subtaskCounts} meUid={meUid} userDisplayName={userDisplayName} />
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
                              <div className="flex items-center gap-1 mt-1 flex-wrap gap-y-1">
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap ${QUADRANT_BADGES[q].cls}`}>
                                  {t(QUADRANT_BADGES[q].tKey)}
                                </span>
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap ${EFFORT_BADGES[todo.effort ?? "medium"].cls}`}>
                                  {t(EFFORT_BADGES[todo.effort ?? "medium"].tKey)}
                                </span>
                                {dl && (
                                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap ${dl.cls}`}>{dl.text}</span>
                                )}
                                {todo.scheduledSlot && (
                                  <ScheduledSlotBadge slot={todo.scheduledSlot} />
                                )}
                                {(subtaskCounts[todo.id] ?? 0) > 0 && (
                                  <SubtaskBadge count={subtaskCounts[todo.id]} />
                                )}
                                {todo.assignedTo && meUid && todo.assignedTo === meUid && todo.userId !== meUid && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                                    <svg className="w-2.5 h-2.5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                    {userDisplayName(todo.userId)}
                                  </span>
                                )}
                                {todo.assignedTo && meUid && todo.assignedTo !== meUid && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300">
                                    <svg className="w-2.5 h-2.5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                    → {userDisplayName(todo.assignedTo)}
                                  </span>
                                )}
                                {todo.assignmentStatus === "declined" && (
                                  <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
                                    {t("assign.declined" as TranslationKey)}
                                  </span>
                                )}
                                {todo.assignmentStatus === "accepted" && (
                                  <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                    {t("assign.accepted" as TranslationKey)}
                                  </span>
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
                                {!todo.parentId && (
                                  <SlotPicker
                                    todoId={todo.id}
                                    scheduledSlot={todo.scheduledSlot}
                                    onBooked={(updated) => setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))}
                                    onCleared={(updated) => setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))}
                                  />
                                )}
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
                                {todo.assignedTo && meUid && todo.assignedTo === meUid && todo.userId !== meUid && todo.assignmentStatus !== "declined" && (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleDecline(todo); }}
                                    className="p-0.5 text-orange-300 dark:text-orange-700 hover:text-orange-600 dark:hover:text-orange-400 cursor-pointer"
                                    aria-label={t("assign.decline" as TranslationKey)}
                                    title={t("assign.decline" as TranslationKey)}
                                  >
                                    <svg className="w-3.5 h-3.5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                )}
                                {todo.assignedTo && meUid && todo.assignedTo === meUid && todo.userId !== meUid && (todo.assignmentStatus === "declined" || todo.assignmentStatus === "pending") && (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleAccept(todo); }}
                                    className="p-0.5 text-emerald-300 dark:text-emerald-700 hover:text-emerald-600 dark:hover:text-emerald-400 cursor-pointer"
                                    aria-label={t("assign.accept" as TranslationKey)}
                                    title={t("assign.accept" as TranslationKey)}
                                  >
                                    <svg className="w-3.5 h-3.5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); requestDelete(todo); }}
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
                  <EisenhowerRadar todos={activeTodos} subtaskCounts={subtaskCounts} meUid={meUid} userDisplayName={userDisplayName} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <TaskEditModal
        todo={editingTodo}
        form={editForm}
        onFormChange={(updates) => setEditForm((f) => ({ ...f, ...updates }))}
        onSave={saveEdit}
        onClose={() => setEditingTodo(null)}
        saving={editSaving}
        assignEmail={editAssignEmail}
        onAssignEmailChange={handleEditAssignLookup}
        assignedUser={editAssignedUser}
        assignError={editAssignError}
        onAssignLookup={() => handleEditAssignLookup(editAssignEmail)}
        onClearAssign={() => setEditForm((f) => ({ ...f, assignedTo: null }))}
        userDisplayName={userDisplayName}
        onOpenSubtasks={openSubtaskModal}
        subtaskCount={editingTodo ? getSubtasks(editingTodo.id).length : 0}
        effortDefaults={user?.effortMinutes}
      />

      <SubtaskModal
        parent={subtaskParent}
        onClose={() => setSubtaskParent(null)}
        onCreateSubtask={handleCreateSubtask}
        creating={subtaskSubmitting}
        existingSubtasks={subtaskParent ? getSubtasks(subtaskParent.id) : []}
        onCompleteSubtask={(sub) => handleStatusChange(sub, sub.status === "completed" ? "active" : "completed")}
        onDeleteSubtask={(sub) => requestDelete(sub)}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title="Supprimer la tâche"
        message={confirmDelete ? `Êtes-vous sûr de vouloir supprimer « ${confirmDelete.title} » ?` : ""}
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        variant="danger"
        onConfirm={() => confirmDelete && performDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </AppShell>
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
  meUid,
  userDisplayName,
  onSort,
  onComplete,
  onCancel,
  onDelete,
  onEdit,
  onSubtask,
  onDecline,
  onAccept,
  projects = [],
  onScheduleUpdate,
}: {
  todos: Todo[];
  allTodos: Todo[];
  sortCol: SortColumn;
  sortDir: SortDirection;
  meUid: string | null;
  userDisplayName: (uid: string) => string;
  onSort: (col: SortColumn) => void;
  onComplete: (t: Todo) => void;
  onCancel: (t: Todo) => void;
  onDelete: (t: Todo) => void;
  onEdit: (t: Todo) => void;
  onSubtask: (t: Todo) => void;
  onDecline: (t: Todo) => void;
  onAccept: (t: Todo) => void;
  projects?: Project[];
  onScheduleUpdate?: (todo: Todo) => void;
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
      <div className="bg-white dark:bg-slate-900 rounded-md shadow-sm border border-zinc-200 dark:border-slate-700 overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
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
                          {!todo.parentId && onScheduleUpdate && (
                            <SlotPicker
                              todoId={todo.id}
                              scheduledSlot={todo.scheduledSlot}
                              onBooked={onScheduleUpdate}
                              onCleared={onScheduleUpdate}
                            />
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
                          {todo.assignedTo && meUid && todo.assignedTo === meUid && todo.userId !== meUid && todo.assignmentStatus !== "declined" && (
                            <button
                              onClick={() => onDecline(todo)}
                              title={t("assign.decline" as TranslationKey)}
                              className="w-6 h-6 rounded flex items-center justify-center border border-orange-300 dark:border-orange-700 text-orange-400 hover:border-orange-500 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                          {todo.assignedTo && meUid && todo.assignedTo === meUid && todo.userId !== meUid && (todo.assignmentStatus === "declined" || todo.assignmentStatus === "pending") && (
                            <button
                              onClick={() => onAccept(todo)}
                              title={t("assign.accept" as TranslationKey)}
                              className="w-6 h-6 rounded flex items-center justify-center border border-emerald-300 dark:border-emerald-700 text-emerald-400 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </button>
                          )}
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
                      {todo.projectId && (() => {
                        const proj = projects.find((p) => p.id === todo.projectId);
                        return proj ? (
                          <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                            {proj.name}
                          </span>
                        ) : null;
                      })()}
                      {todo.assignedTo && meUid && todo.assignedTo === meUid && todo.userId !== meUid && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" title={`${t("assign.assignedBy" as TranslationKey)} ${userDisplayName(todo.userId)}`}>
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          {userDisplayName(todo.userId)}
                        </span>
                      )}
                      {todo.assignedTo && meUid && todo.assignedTo !== meUid && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300" title={`${t("assign.assignedTo" as TranslationKey)} ${userDisplayName(todo.assignedTo)}`}>
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          → {userDisplayName(todo.assignedTo)}
                        </span>
                      )}
                      {todo.assignmentStatus === "declined" && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
                          {t("assign.declined" as TranslationKey)}
                        </span>
                      )}
                      {todo.assignmentStatus === "accepted" && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                          {t("assign.accepted" as TranslationKey)}
                        </span>
                      )}
                      {todo.scheduledSlot && (
                        <span className="ml-1.5"><ScheduledSlotBadge slot={todo.scheduledSlot} /></span>
                      )}
                      {subtasksOf(todo.id).length > 0 && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleExpand(todo.id); }}
                          className={`ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded transition-colors hover:bg-emerald-700 ${SUBTASK_BADGE_CLS}`}
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
                      {(() => {
                        const mins = todo.estimatedMinutes;
                        if (mins == null) return null;
                        return (
                          <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300">
                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            {mins}{t("todos.estimatedMinutes")}
                          </span>
                        );
                      })()}
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
  onDecline,
  onAccept,
  onEdit,
  onScheduleUpdate,
  subtaskCounts = {},
  meUid,
  userDisplayName,
}: {
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
  meUid?: string | null;
  userDisplayName?: (uid: string) => string;
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
                  <TodoCard todo={todo} onComplete={onComplete} onDelete={onDelete} onDecline={onDecline} onAccept={onAccept} onEdit={onEdit} onScheduleUpdate={onScheduleUpdate} subtaskCount={sc} onToggleSubtasks={sc > 0 ? () => toggleExpand(todo.id) : undefined} subtasksExpanded={expanded.has(todo.id)} meUid={meUid} userDisplayName={userDisplayName} />
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

