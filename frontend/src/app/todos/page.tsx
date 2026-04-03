"use client";

import { FormEvent, Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthContext";
import ConfirmDialog from "@/components/ConfirmDialog";
import DeleteTaskDialog from "@/components/DeleteTaskDialog";
import EisenhowerRadar from "@/components/EisenhowerRadar";
import PageHelpButton from "@/components/PageHelpButton";
import SlotPicker, { ScheduledSlotBadge } from "@/components/SlotPicker";
import SubtaskModal from "@/components/SubtaskModal";
import TaskEditModal from "@/components/TaskEditModal";
import CommentHoverIcon from "@/components/CommentHoverIcon";
import TodoCard from "@/components/TodoCard";
import { useToast } from "@/components/Toast";
import {
  createTodo,
  createNoteApi,
  getTodoNoteMap,
  deleteTodo,
  getTodos,
  getArchivedTodos,
  getAssignedTodos,
  getProjects,
  getCommentCounts,
  updateTodo,
  reorderTodos as reorderTodosApi,
  lookupUser,
  getCollaborators,
  getTeams,
  Todo,
  Priority,
  Effort,
  TodoStatus,
  AuthMeResponse,
  Project,
  Collaborator,
  Team,
} from "@/lib/api";
import { classify } from "@/lib/classify";
import { deadlineLabel } from "@/lib/deadlineUtils";
import { EFFORT_BADGES } from "@/lib/effortBadges";
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

import { FILTER_BUTTONS, QUADRANT_BADGES, QUADRANT_RANK, PRIORITY_RANK, sortTodos } from "./_components/sortUtils";
import SubtaskBadge from "./_components/SubtaskBadge";
import TaskList from "./_components/TaskList";
import QuadrantCell from "./_components/QuadrantCell";

export default function TodosPage() {
  const { t } = useLocale();
  const { user } = useAuth();
  const router = useRouter();
  const meUid = user?.uid ?? null;
  const { resolveUser, displayName: userDisplayName, cache: userCache } = useUserLookup();
  const { toast } = useToast();

  const [myTodos, setMyTodos] = useState<Todo[]>([]);
  const [assignedTodos, setAssignedTodos] = useState<Todo[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [todoNoteIds, setTodoNoteIds] = useState<Record<string, string>>({});

  type TaskScope = "all" | "personal" | "assigned" | "delegated";
  const [scope, setScope] = useState<TaskScope>("all");

  const personalTodos = useMemo(() =>
    myTodos.filter((t) => !t.assignedTo || t.assignedTo === meUid),
    [myTodos, meUid],
  );
  const delegatedTodos = useMemo(() =>
    myTodos.filter((t) => t.assignedTo && t.assignedTo !== meUid),
    [myTodos, meUid],
  );

  const todos = useMemo(() => {
    if (scope === "personal") return personalTodos;
    if (scope === "assigned") return assignedTodos;
    if (scope === "delegated") return delegatedTodos;
    const seen = new Set<string>();
    const all: Todo[] = [];
    for (const t of [...personalTodos, ...assignedTodos, ...delegatedTodos]) {
      if (!seen.has(t.id)) { seen.add(t.id); all.push(t); }
    }
    return all;
  }, [personalTodos, assignedTodos, delegatedTodos, scope]);

  const scopeCounts = useMemo(() => {
    const isActive = (t: Todo) => t.status === "active" && !t.parentId;
    const ap = personalTodos.filter(isActive);
    const aa = assignedTodos.filter(isActive);
    const ad = delegatedTodos.filter(isActive);
    const allSet = new Set<string>();
    [...ap, ...aa, ...ad].forEach((t) => allSet.add(t.id));
    return { all: allSet.size, personal: ap.length, assigned: aa.length, delegated: ad.length };
  }, [personalTodos, assignedTodos, delegatedTodos]);

  const setTodos = (updater: (prev: Todo[]) => Todo[]) => {
    setMyTodos(updater);
    setAssignedTodos(updater);
  };

  const sortedProjectOptions = useMemo(() => {
    const roots = projects.filter((p) => !p.parentProjectId);
    const childrenMap = new Map<string, Project[]>();
    for (const p of projects) {
      if (p.parentProjectId) {
        const list = childrenMap.get(p.parentProjectId) ?? [];
        list.push(p);
        childrenMap.set(p.parentProjectId, list);
      }
    }
    const result: { id: string; label: string }[] = [];
    for (const root of roots) {
      result.push({ id: root.id, label: root.name });
      for (const child of childrenMap.get(root.id) ?? []) {
        result.push({ id: child.id, label: `↳ ${child.name}` });
      }
    }
    return result;
  }, [projects]);

  const getPhaseRange = useCallback((phaseId: string | null | undefined) => {
    if (!phaseId) return { start: undefined as string | undefined, end: undefined as string | undefined };
    for (const proj of projects) {
      const phase = proj.phases?.find((p) => p.id === phaseId);
      if (phase) return { start: phase.startDate ?? undefined, end: phase.endDate ?? undefined };
    }
    return { start: undefined as string | undefined, end: undefined as string | undefined };
  }, [projects]);

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
  const [showAssignSuggestions, setShowAssignSuggestions] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const assignWrapperRef = useRef<HTMLDivElement>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);

  const [filters, setFilters] = useState<Set<FilterKey>>(new Set());
  const [filterProject, setFilterProject] = useState<string | "__none__" | null>(null);
  const [filterAssignee, setFilterAssignee] = useState<string | "__unassigned__" | null>(null);
  type DeadlineFilter = "all" | "today" | "week" | "overdue" | "none";
  const [filterDeadline, setFilterDeadline] = useState<DeadlineFilter>("all");
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [sortCol, setSortCol] = useState<SortColumn>("classification");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");
  const [lastAction, setLastAction] = useState<{ todoId: string; previousStatus: TodoStatus } | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [mainView, setMainView] = useState<"list" | "cards" | "radar">("list");
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [editForm, setEditForm] = useState({ title: "", priority: "medium" as Priority, effort: "medium" as Effort, startDate: "", deadline: "", assignedTo: "" as string | null, estimatedMinutes: null as number | null, tags: [] as string[], recurrence: null as import("@/lib/api").Recurrence | null, projectId: null as string | null });
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
      startDate: todo.startDate ?? "",
      deadline: todo.deadline ?? "",
      assignedTo: todo.assignedTo ?? null,
      estimatedMinutes: todo.estimatedMinutes ?? null,
      tags: todo.tags ?? [],
      recurrence: todo.recurrence ?? null,
      projectId: todo.projectId ?? null,
    });
    setEditAssignEmail("");
    setEditAssignedUser(null);
    setEditAssignError(null);
    if (todo.assignedTo && !userCache[todo.assignedTo]) {
      resolveUser(todo.assignedTo);
    }
  };

  const closeEditModal = useCallback(() => {
    setEditingTodo(null);
    getCommentCounts().then(setCommentCounts).catch(() => {});
  }, []);

  const saveEdit = async () => {
    if (!editingTodo) return;
    setEditSaving(true);
    try {
      const updated = await updateTodo(editingTodo.id, {
        title: editForm.title,
        priority: editForm.priority,
        effort: editForm.effort,
        startDate: editForm.startDate || null,
        deadline: editForm.deadline || null,
        assignedTo: editForm.assignedTo,
        estimatedMinutes: editForm.estimatedMinutes,
        tags: editForm.tags,
        recurrence: editForm.recurrence,
        projectId: editForm.projectId,
      });
      setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      closeEditModal();
      toast.success(t("toast.taskUpdated"));
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
    if (!showAssignSuggestions) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (assignWrapperRef.current && !assignWrapperRef.current.contains(e.target as Node)) {
        setShowAssignSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showAssignSuggestions]);

  useEffect(() => {
    if (!meUid) return;
    let cancelled = false;
    (async () => {
      try {
        const [mine, archived, assigned, projs, ccounts, noteMap, collabs, tms] = await Promise.all([
          getTodos(),
          getArchivedTodos(),
          getAssignedTodos(),
          getProjects(),
          getCommentCounts(),
          getTodoNoteMap().catch(() => ({} as Record<string, string>)),
          getCollaborators().catch(() => [] as Collaborator[]),
          getTeams().catch(() => [] as Team[]),
        ]);
        if (!cancelled) {
          setMyTodos([...mine, ...archived]);
          setAssignedTodos(assigned);
          setProjects(projs.filter((p) => p.status === "active"));
          setCommentCounts(ccounts);
          setTodoNoteIds(noteMap);
          setCollaborators(collabs.filter((c) => c.status === "active"));
          setTeams(tms);
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
      setJustCreatedId(todo.id);
      setTimeout(() => setJustCreatedId(null), 10000);
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

  const handleStatusChange = useCallback(async (todo: Todo, newStatus: TodoStatus) => {
    try {
      const previousStatus = todo.status;
      const updated = await updateTodo(todo.id, { status: newStatus });
      setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setLastAction({ todoId: todo.id, previousStatus });
    } catch {
      toast.error(t("toast.updateError"));
    }
  }, [toast]);

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
      const previousStatus = todo.status;
      if (todo.status === "deleted") {
        const restored = await updateTodo(todo.id, { status: "active" });
        setTodos((prev) => prev.map((t) => (t.id === restored.id ? restored : t)));
        setLastAction({ todoId: todo.id, previousStatus });
      } else {
        const subs = getSubtasks(todo.id);
        if (subs.length > 0) {
          if (mode === "promote") {
            const promoted = await Promise.all(subs.map((s) => updateTodo(s.id, { parentId: null })));
            setTodos((prev) => prev.map((t) => {
              const p = promoted.find((u) => u.id === t.id);
              return p ?? t;
            }));
          } else {
            const deleted = await Promise.all(subs.map((s) => deleteTodo(s.id)));
            setTodos((prev) => prev.map((t) => {
              const d = deleted.find((u) => u.id === t.id);
              return d ?? t;
            }));
          }
        }
        const updated = await deleteTodo(todo.id);
        setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        setLastAction({ todoId: todo.id, previousStatus });
      }
    } catch {
      toast.error(t("toast.deleteError"));
    }
  };

  const handleDecline = useCallback(async (todo: Todo) => {
    try {
      const updated = await updateTodo(todo.id, { assignmentStatus: "declined" });
      setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch {
      toast.error(t("toast.declineError"));
    }
  }, [toast]);

  const handleAccept = useCallback(async (todo: Todo) => {
    try {
      const updated = await updateTodo(todo.id, { assignmentStatus: "accepted" });
      setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch {
      toast.error(t("toast.acceptError"));
    }
  }, [toast]);

  const handleUndo = async () => {
    if (!lastAction || undoing) return;
    setUndoing(true);
    try {
      const updated = await updateTodo(lastAction.todoId, { status: lastAction.previousStatus });
      setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setLastAction(null);
    } catch {
      toast.error(t("toast.cancelError"));
    } finally {
      setUndoing(false);
    }
  };

  const getSubtasks = (parentId: string) => subtasksByParent[parentId] ?? [];

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

  const assignSuggestions = useMemo(() => {
    const selectedProject = projects.find((p) => p.id === selectedProjectId);
    const teamId = selectedProject?.teamId ?? null;
    const team = teamId ? teams.find((tm) => tm.id === teamId) : null;

    const emails: string[] = team
      ? team.members.map((m) => m.email)
      : collaborators.map((c) => c.email);

    if (!assignEmail || assignEmail.length < 1) return emails;
    const q = assignEmail.toLowerCase();
    return emails.filter((e) => e.toLowerCase().includes(q));
  }, [assignEmail, selectedProjectId, projects, teams, collaborators]);

  const handleAssignLookup = (email: string) => {
    setAssignEmail(email);
    setAssignError(null);
    setShowAssignSuggestions(true);
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

  const selectSuggestion = (email: string) => {
    setAssignEmail(email);
    setShowAssignSuggestions(false);
    setAssignError(null);
    clearTimeout(assignLookupTimer.current);
    assignLookupTimer.current = setTimeout(async () => {
      try {
        const u = await lookupUser(email);
        if (u) { setAssignedUser(u); setAssignError(null); }
        else { setAssignedUser(null); setAssignError(t("assign.userNotFound")); }
      } catch { setAssignedUser(null); }
    }, 100);
  };

  const editMemberSuggestions = useMemo(() => {
    const projectId = editingTodo?.projectId ?? editForm.projectId;
    const project = projectId ? projects.find((p) => p.id === projectId) : null;
    const teamId = project?.teamId ?? null;
    const team = teamId ? teams.find((tm) => tm.id === teamId) : null;

    return team
      ? team.members.map((m) => m.email)
      : collaborators.map((c) => c.email);
  }, [editingTodo?.projectId, editForm.projectId, projects, teams, collaborators]);

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

  const handleScheduleUpdate = useCallback((updated: Todo) => {
    setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }, []);

  const handleReorder = useCallback(async (orderedIds: string[]) => {
    try {
      await reorderTodosApi(orderedIds);
    } catch {
      toast.error(t("toast.reorderError"));
    }
  }, [toast]);

  const handleNoteAction = useCallback(async (todo: Todo) => {
    const existingNoteId = todoNoteIds[todo.id];
    if (existingNoteId) {
      router.push(`/notes?id=${existingNoteId}`);
      return;
    }
    try {
      const note = await createNoteApi({
        title: todo.title,
        content: "",
        todoId: todo.id,
        projectId: todo.projectId ?? undefined,
      });
      setTodoNoteIds((prev) => ({ ...prev, [todo.id]: note.id }));
      toast.success(t("notes.noteCreated"));
      router.push(`/notes?id=${note.id}`);
    } catch {
      toast.error(t("toast.noteCreateError"));
    }
  }, [toast, t, router, todoNoteIds]);

  const openSubtaskModal = (todo: Todo) => {
    setSubtaskParent(todo);
  };

  const handlePromoteSubtask = async (sub: Todo) => {
    try {
      const updated = await updateTodo(sub.id, { parentId: null });
      setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch {
      toast.error(t("toast.genericError"));
    }
  };

  const handleReorderSubtasks = async (orderedIds: string[]) => {
    setTodos((prev) => {
      const updated = [...prev];
      orderedIds.forEach((id, idx) => {
        const i = updated.findIndex((t) => t.id === id);
        if (i !== -1) updated[i] = { ...updated[i], sortOrder: idx };
      });
      return updated;
    });
    try {
      await reorderTodosApi(orderedIds);
    } catch {
      toast.error(t("toast.reorderError"));
    }
  };

  const hasAdvancedFilters = filterProject !== null || filterAssignee !== null || filterDeadline !== "all" || filterTag !== null;

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

      if (filterTag && !(t.tags ?? []).includes(filterTag)) return false;

      return true;
    });
  }, [todos, filterProject, filterAssignee, filterDeadline, filterTag, hasAdvancedFilters]);

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

  const { subtaskCounts, subtasksByParent } = useMemo(() => {
    const counts: Record<string, number> = {};
    const byParent: Record<string, Todo[]> = {};
    for (const td of todos) {
      if (td.parentId) {
        counts[td.parentId] = (counts[td.parentId] ?? 0) + 1;
        (byParent[td.parentId] ??= []).push(td);
      }
    }
    for (const key of Object.keys(byParent)) {
      byParent[key].sort((a, b) => (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity));
    }
    return { subtaskCounts: counts, subtasksByParent: byParent };
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

  const radarPriorityList = useMemo(() => {
    const source: Todo[] = filters.size === 0 ? activeTodos : listTodos;
    return [...source].sort((a, b) => {
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
  }, [filters.size, activeTodos, listTodos]);

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
      <div className="max-w-[1400px] mx-auto space-y-6">
        {/* ── Create form ── */}
        <form
          onSubmit={handleCreate}
          className="bg-white dark:bg-slate-900 rounded-md shadow-sm border border-zinc-200 dark:border-slate-700 p-3 sm:p-5"
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder={t("todos.addPlaceholder")}
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="flex-1 min-w-0 rounded border border-zinc-300 dark:border-slate-600 px-3 sm:px-4 py-2 sm:py-2.5 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 placeholder:text-zinc-400 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400 h-[38px] sm:h-[42px]"
              />
              <button
                type="submit"
                disabled={submitting || !!assignError}
                className="rounded bg-slate-700 dark:bg-slate-600 px-6 py-2 sm:py-2.5 text-sm font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-60 whitespace-nowrap transition-colors h-[38px] sm:h-[42px] shrink-0"
              >
                {submitting ? t("todos.adding") : t("todos.add")}
              </button>
            </div>
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-3 sm:items-center">
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenDropdown(openDropdown === "priority" ? null : "priority");
                  }}
                  className={`w-full sm:w-auto rounded border px-3 py-2 sm:py-2.5 text-sm font-medium transition-colors h-[38px] sm:h-[42px] sm:min-w-[100px] text-center ${
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
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenDropdown(openDropdown === "effort" ? null : "effort");
                  }}
                  className={`w-full sm:w-auto rounded border px-3 py-2 sm:py-2.5 text-sm font-medium transition-colors h-[38px] sm:h-[42px] sm:min-w-[100px] text-center ${
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
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) => setDeadline(e.target.value)}
                className="col-span-1 sm:shrink-0 rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 sm:py-2.5 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400 h-[38px] sm:h-[42px]"
              />
              {sortedProjectOptions.length > 0 && (
                <select
                  value={selectedProjectId ?? ""}
                  onChange={(e) => setSelectedProjectId(e.target.value || null)}
                  className="col-span-1 sm:shrink-0 rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 sm:py-2.5 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400 h-[38px] sm:h-[42px]"
                >
                  <option value="">{t("projects.noProject")}</option>
                  {sortedProjectOptions.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              )}
              <div ref={assignWrapperRef} className="relative col-span-2 sm:flex-1 sm:min-w-[200px]">
                <input
                  type="email"
                  placeholder={t("assign.placeholder")}
                  value={assignEmail}
                  onChange={(e) => handleAssignLookup(e.target.value)}
                  onFocus={() => setShowAssignSuggestions(true)}
                  autoComplete="off"
                  className={`w-full rounded border px-3 py-2 sm:py-2.5 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:outline-none focus:ring-1 h-[38px] sm:h-[42px] ${
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
                {showAssignSuggestions && assignSuggestions.length > 0 && !assignedUser && (
                  <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white dark:bg-slate-800 border border-zinc-200 dark:border-slate-600 rounded shadow-lg py-1 max-h-40 overflow-y-auto">
                    {assignSuggestions.slice(0, 8).map((email) => (
                      <button
                        key={email}
                        type="button"
                        onClick={() => selectSuggestion(email)}
                        className="block w-full text-left px-3 py-1.5 text-sm text-zinc-700 dark:text-slate-200 hover:bg-zinc-100 dark:hover:bg-slate-700 transition-colors truncate"
                      >
                        {email}
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
                  {filters.size + (filterProject !== null ? 1 : 0) + (filterAssignee !== null ? 1 : 0) + (filterDeadline !== "all" ? 1 : 0) + (filterTag !== null ? 1 : 0)}
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
                    {sortedProjectOptions.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
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

                {/* Tag filter */}
                {(() => {
                  const allTags = [...new Set(todos.flatMap((td) => td.tags ?? []))].sort();
                  if (allTags.length === 0) return null;
                  return (
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-medium text-zinc-500 dark:text-slate-400 uppercase tracking-wider">{t("tags.filter")}</span>
                      <select
                        value={filterTag ?? ""}
                        onChange={(e) => setFilterTag(e.target.value || null)}
                        className="rounded border border-zinc-200 dark:border-slate-600 bg-zinc-50 dark:bg-slate-800 text-zinc-700 dark:text-slate-300 text-xs px-2 py-1.5 pr-6 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      >
                        <option value="">{t("tags.allTags")}</option>
                        {allTags.map((tag) => (
                          <option key={tag} value={tag}>{tag}</option>
                        ))}
                      </select>
                    </div>
                  );
                })()}
              </div>

              {/* Clear all */}
              {(filters.size > 0 || hasAdvancedFilters) && (
                <div className="pt-1 border-t border-zinc-100 dark:border-slate-700/50">
                  <button
                    type="button"
                    onClick={() => { setFilters(new Set()); setFilterProject(null); setFilterAssignee(null); setFilterDeadline("all"); setFilterTag(null); }}
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
              <PageHelpButton
                title={t("todos.listTitle")}
                items={[
                  { text: t("help.todos.views") },
                  { text: t("help.todos.dnd") },
                  { text: t("help.todos.edit") },
                  { text: t("help.todos.recurrence") },
                  { text: t("help.todos.attachments") },
                  { text: t("help.todos.comments") },
                  { text: t("help.todos.export") },
                ]}
              />
              <div className="flex rounded border border-zinc-200 dark:border-slate-600 overflow-hidden">
                {(["all", "personal", "assigned", "delegated"] as TaskScope[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScope(s)}
                    className={`px-3 py-1 text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
                      scope === s
                        ? "bg-slate-700 dark:bg-slate-600 text-white dark:text-slate-100"
                        : "text-zinc-500 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800"
                    } ${s !== "all" ? "border-l border-zinc-200 dark:border-slate-600" : ""}`}
                  >
                    {t(`scope.${s}`)}
                    <span className={`text-[10px] rounded-full px-1.5 py-0.5 leading-none font-bold ${
                      scope === s
                        ? "bg-white/20 text-white"
                        : "bg-zinc-100 dark:bg-slate-700 text-zinc-400 dark:text-slate-500"
                    }`}>
                      {scopeCounts[s]}
                    </span>
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
                      ? "bg-slate-700 dark:bg-slate-600 text-white dark:text-slate-100"
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
                      ? "bg-slate-700 dark:bg-slate-600 text-white dark:text-slate-100"
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
                      ? "bg-slate-700 dark:bg-slate-600 text-white dark:text-slate-100"
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
              onScheduleUpdate={handleScheduleUpdate}
              onCreateNote={handleNoteAction}
              todoNoteIds={todoNoteIds}
              onReorderSubtasks={handleReorderSubtasks}
              justCreatedId={justCreatedId}
              commentCounts={commentCounts}
              onReorder={handleReorder}
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
                        <TodoCard key={todo.id} todo={todo} onComplete={(t) => handleStatusChange(t, t.status === "completed" ? "active" : "completed")} onDelete={(t) => requestDelete(t)} onDecline={handleDecline} onAccept={handleAccept} onEdit={openEdit} onScheduleUpdate={handleScheduleUpdate} subtaskCount={getSubtasks(todo.id).length} meUid={meUid} userDisplayName={userDisplayName} commentCount={commentCounts[todo.id] ?? 0} />
                      ))}
                    </div>
                  )}
                </div>
              ) : filters.size > 0 && activeQuadrantFilters.length > 0 ? (
                /* Quadrant filters: show selected quadrants expanded */
                <div className={`grid gap-2 ${activeQuadrantFilters.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
                  {activeQuadrantFilters.map((q) => (
                    <div key={q} className="rounded overflow-hidden">
                      <QuadrantCell quadrant={q} todos={grouped[q]} allTodos={todos} onComplete={(t) => handleStatusChange(t, "completed")} onDelete={(t) => requestDelete(t)} onDecline={handleDecline} onAccept={handleAccept} onEdit={openEdit} onScheduleUpdate={handleScheduleUpdate} subtaskCounts={subtaskCounts} commentCounts={commentCounts} meUid={meUid} userDisplayName={userDisplayName} projects={projects} />
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
                          <TodoCard key={todo.id} todo={todo} onComplete={(t) => handleStatusChange(t, t.status === "completed" ? "active" : "completed")} onDelete={(t) => requestDelete(t)} onDecline={handleDecline} onAccept={handleAccept} onEdit={openEdit} onScheduleUpdate={handleScheduleUpdate} subtaskCount={getSubtasks(todo.id).length} meUid={meUid} userDisplayName={userDisplayName} commentCount={commentCounts[todo.id] ?? 0} />
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
                      <QuadrantCell quadrant="schedule" todos={grouped.schedule} allTodos={todos} onComplete={(t) => handleStatusChange(t, "completed")} onDelete={(t) => requestDelete(t)} onDecline={handleDecline} onAccept={handleAccept} onEdit={openEdit} onScheduleUpdate={handleScheduleUpdate} subtaskCounts={subtaskCounts} commentCounts={commentCounts} meUid={meUid} userDisplayName={userDisplayName} projects={projects} />
                    </div>
                    <div className="rounded overflow-hidden">
                      <QuadrantCell quadrant="do-first" todos={grouped["do-first"]} allTodos={todos} onComplete={(t) => handleStatusChange(t, "completed")} onDelete={(t) => requestDelete(t)} onDecline={handleDecline} onAccept={handleAccept} onEdit={openEdit} onScheduleUpdate={handleScheduleUpdate} subtaskCounts={subtaskCounts} commentCounts={commentCounts} meUid={meUid} userDisplayName={userDisplayName} projects={projects} />
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
                      <QuadrantCell quadrant="eliminate" todos={grouped.eliminate} allTodos={todos} onComplete={(t) => handleStatusChange(t, "completed")} onDelete={(t) => requestDelete(t)} onDecline={handleDecline} onAccept={handleAccept} onEdit={openEdit} onScheduleUpdate={handleScheduleUpdate} subtaskCounts={subtaskCounts} commentCounts={commentCounts} meUid={meUid} userDisplayName={userDisplayName} projects={projects} />
                    </div>
                    <div className="rounded overflow-hidden">
                      <QuadrantCell quadrant="delegate" todos={grouped.delegate} allTodos={todos} onComplete={(t) => handleStatusChange(t, "completed")} onDelete={(t) => requestDelete(t)} onDecline={handleDecline} onAccept={handleAccept} onEdit={openEdit} onScheduleUpdate={handleScheduleUpdate} subtaskCounts={subtaskCounts} commentCounts={commentCounts} meUid={meUid} userDisplayName={userDisplayName} projects={projects} />
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-md shadow-sm border border-zinc-200 dark:border-slate-700 p-6">
              <div className="flex flex-col md:flex-row gap-6">
                {/* Priority list */}
                <div className="w-full md:w-72 md:shrink-0">
                  <h3 className="text-sm font-semibold text-zinc-700 dark:text-slate-300 mb-3 flex items-center gap-1.5">
                    {filters.size === 0
                      ? t("todos.priorities")
                      : [...filters].map((f) => { const btn = FILTER_BUTTONS.find((b) => b.key === f); return btn ? t(btn.tKey) : f; }).join(", ")}
                  </h3>
                  <div className="space-y-2">
                    {(() => {
                      const priorityTodos = radarPriorityList;
                      const CARD_BG: Record<Quadrant, string> = {
                        "do-first": "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800",
                        schedule: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800",
                        delegate: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800",
                        eliminate: "bg-zinc-50 dark:bg-slate-800/40 border-zinc-200 dark:border-slate-700",
                      };
                      return priorityTodos.slice(0, 5).map((todo, i) => {
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
                                    {t("assign.declined")}
                                  </span>
                                )}
                                {(todo.tags ?? []).map((tag) => (
                                  <span key={tag} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 shrink-0 whitespace-nowrap">
                                    {tag}
                                  </span>
                                ))}
                                {todo.assignmentStatus === "accepted" && (
                                  <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                    {t("assign.accepted")}
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
                                    suggestedSlot={todo.suggestedSlot}
                                    onBooked={handleScheduleUpdate}
                                    onCleared={handleScheduleUpdate}
                                    autoOpen={todo.id === justCreatedId}
                                    dateMin={getPhaseRange(todo.phaseId).start}
                                    dateMax={getPhaseRange(todo.phaseId).end}
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
                                    aria-label={t("assign.decline")}
                                    title={t("assign.decline")}
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
                                    aria-label={t("assign.accept")}
                                    title={t("assign.accept")}
                                  >
                                    <svg className="w-3.5 h-3.5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                  </button>
                                )}
                                <CommentHoverIcon
                                  todoId={todo.id}
                                  commentCount={commentCounts[todo.id] ?? 0}
                                  onClick={() => openEdit(todo)}
                                />
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
                <div className="flex-1 min-w-0">
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
        onClose={closeEditModal}
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
        currentUserUid={user?.uid}
        projects={projects}
        memberSuggestions={editMemberSuggestions}
        isTaskOwner={!editingTodo || editingTodo.userId === user?.uid}
        onAcceptDecline={editingTodo ? (status) => {
          if (status === "accepted") handleAccept(editingTodo);
          else handleDecline(editingTodo);
          closeEditModal();
        } : undefined}
        onSuggestedSlotChange={editingTodo && editingTodo.userId === user?.uid && editingTodo.assignedTo ? async (slot) => {
          try {
            const updated = await updateTodo(editingTodo.id, { suggestedSlot: slot });
            setTodos((prev) => prev.map((t) => t.id === updated.id ? updated : t));
            setEditingTodo(updated);
          } catch { /* handled by API layer */ }
        } : undefined}
      />

      <SubtaskModal
        parent={subtaskParent}
        onClose={() => setSubtaskParent(null)}
        onCreateSubtask={handleCreateSubtask}
        creating={subtaskSubmitting}
        existingSubtasks={subtaskParent ? getSubtasks(subtaskParent.id) : []}
        onCompleteSubtask={(sub) => handleStatusChange(sub, sub.status === "completed" ? "active" : "completed")}
        onDeleteSubtask={(sub) => requestDelete(sub)}
        onPromoteSubtask={handlePromoteSubtask}
        onReorderSubtasks={handleReorderSubtasks}
      />

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

