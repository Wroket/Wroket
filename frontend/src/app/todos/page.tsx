"use client";

import { FormEvent, Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthContext";
import DeleteTaskDialog from "@/components/DeleteTaskDialog";
import EisenhowerRadar from "@/components/EisenhowerRadar";
import PageHelpButton from "@/components/PageHelpButton";
import { ScheduledSlotBadge } from "@/components/SlotPicker";
import SubtaskModal from "@/components/SubtaskModal";
import ContactEmailSuggestInput from "@/components/ContactEmailSuggestInput";
import TaskEditModal from "@/components/TaskEditModal";
import TodoCard from "@/components/TodoCard";
import TaskIconToolbar from "@/components/TaskIconToolbar";
import { useToast } from "@/components/Toast";
import ExportImportDropdown from "@/components/ExportImportDropdown";
import TaskImportModal from "@/components/TaskImportModal";
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
  exportTasks,
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
import { createTaskMeet, getTaskSlots } from "@/lib/api/calendar";
import { displayTodoTitle } from "@/lib/todoDisplay";
import { classify } from "@/lib/classify";
import { deadlineLabel } from "@/lib/deadlineUtils";
import { getEffectiveDueDay, hasNoEffectiveDue } from "@/lib/effectiveDue";
import { EFFORT_BADGES } from "@/lib/effortBadges";
import { useLocale } from "@/lib/LocaleContext";
import {
  PRIORITY_BADGES,
  type Quadrant,
  type FilterKey,
  type SortColumn,
  type SortDirection,
} from "@/lib/todoConstants";
import { useUserLookup } from "@/lib/userUtils";
import { useTaskEditAutoSave } from "@/lib/useTaskEditAutoSave";
import { useTodoListSync } from "@/lib/useTodoListSync";
import { compareTodosForRadarList, type RadarMode } from "@/lib/taskScores";
import type { TranslationKey } from "@/lib/i18n";

import { FILTER_BUTTONS, QUADRANT_BADGES } from "./_components/sortUtils";

const RADAR_MODE_LABEL_KEYS: Record<RadarMode, TranslationKey> = {
  eisenhower: "matrix.radarModeEisenhower",
  pressure: "matrix.radarModePressure",
  roi: "matrix.radarModeRoi",
  load: "matrix.radarModeLoad",
};
import SubtaskBadge from "./_components/SubtaskBadge";
import TaskList from "./_components/TaskList";
import QuadrantCell from "./_components/QuadrantCell";

function replaceTodoInArray(list: Todo[], updated: Todo): Todo[] {
  const i = list.findIndex((t) => t.id === updated.id);
  if (i === -1) return list;
  const next = [...list];
  next[i] = updated;
  return next;
}

function mergeTodosIntoArray(list: Todo[], updates: Todo[]): Todo[] {
  if (updates.length === 0) return list;
  const byId = new Map(updates.map((u) => [u.id, u] as const));
  return list.map((t) => byId.get(t.id) ?? t);
}

function applySortOrderPatchToList(list: Todo[], orderedIds: string[]): Todo[] {
  const updated = [...list];
  orderedIds.forEach((id, idx) => {
    const i = updated.findIndex((t) => t.id === id);
    if (i !== -1) updated[i] = { ...updated[i], sortOrder: idx };
  });
  return updated;
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const offsetPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+0";
  const match = offsetPart.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] ?? "0");
  const minutes = Number(match[3] ?? "0");
  return sign * (hours * 60 + minutes);
}

function formatIsoForDateTimeInputInZone(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const byType = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${byType("year")}-${byType("month")}-${byType("day")}T${byType("hour")}:${byType("minute")}`;
}

function wallTimeInZoneToIso(value: string, timeZone: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return new Date(value).toISOString();
  const [, y, mo, d, h, mi] = match;
  const utcGuess = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), 0, 0));
  const offsetMinutes = getTimeZoneOffsetMinutes(utcGuess, timeZone);
  const ts = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), 0, 0) - offsetMinutes * 60_000;
  return new Date(ts).toISOString();
}

function mapMeetErrorToMessageKey(message: string): TranslationKey {
  const msg = message.toLowerCase();
  if (msg.includes("connectez") || msg.includes("non connecté") || msg.includes("connect")) return "meet.errorNoGoogle";
  if (msg.includes("invités externes") || msg.includes("forbiddenfornonorganizer")) return "meet.errorExternalInvitePolicy";
  if (msg.includes("permissions google calendar insuffisantes") || msg.includes("permissions")) return "meet.errorPermissions";
  if (msg.includes("calendrier google introuvable") || msg.includes("calendrier par défaut")) return "meet.errorDefaultCalendar";
  if (msg.includes("rejeté un ou plusieurs invités") || msg.includes("email invalide")) return "meet.errorInvitees";
  return "meet.error";
}

export default function TodosPage() {
  const { t } = useLocale();
  const { user } = useAuth();
  const userTimeZone = user?.workingHours?.timezone ?? "UTC";
  const router = useRouter();
  const searchParams = useSearchParams();
  const meUid = user?.uid ?? null;
  const { resolveUser, displayName: userDisplayName, cacheRef: userCacheRef } = useUserLookup();
  const { toast } = useToast();

  const [myTodos, setMyTodos] = useState<Todo[]>([]);
  const [assignedTodos, setAssignedTodos] = useState<Todo[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const bumpRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);
  useTodoListSync(bumpRefresh);
  const [taskImportFile, setTaskImportFile] = useState<File | null>(null);
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

  const replaceTodoInLists = useCallback((updated: Todo) => {
    setMyTodos((prev) => replaceTodoInArray(prev, updated));
    setAssignedTodos((prev) => replaceTodoInArray(prev, updated));
  }, []);

  const mergeTodosIntoLists = useCallback((updates: Todo[]) => {
    setMyTodos((prev) => mergeTodosIntoArray(prev, updates));
    setAssignedTodos((prev) => mergeTodosIntoArray(prev, updates));
  }, []);

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
  const [, setCollaborators] = useState<Collaborator[]>([]);
  const [, setTeams] = useState<Team[]>([]);
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
  const [radarMode, setRadarMode] = useState<RadarMode>("eisenhower");
  const [nowMs, setNowMs] = useState(Date.now);
  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    const id = setInterval(tick, 60_000);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  const createInFlightRef = useRef(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [editForm, setEditForm] = useState({ title: "", priority: "medium" as Priority, effort: "medium" as Effort, startDate: "", deadline: "", assignedTo: "" as string | null, estimatedMinutes: null as number | null, tags: [] as string[], recurrence: null as import("@/lib/api").Recurrence | null, projectId: null as string | null });
  const [editAssignEmail, setEditAssignEmail] = useState("");
  const [editAssignedUser, setEditAssignedUser] = useState<AuthMeResponse | null>(null);
  const [editAssignError, setEditAssignError] = useState<string | null>(null);

  const [subtaskParent, setSubtaskParent] = useState<Todo | null>(null);
  const [subtaskSubmitting, setSubtaskSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Todo | null>(null);
  const assignLookupTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const editAssignLookupTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => {
      if (assignLookupTimer.current) clearTimeout(assignLookupTimer.current);
      if (editAssignLookupTimer.current) clearTimeout(editAssignLookupTimer.current);
    };
  }, []);

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
    if (todo.assignedTo && !userCacheRef.current[todo.assignedTo]) {
      resolveUser(todo.assignedTo);
    }
  };

  const openEditRef = useRef(openEdit);
  openEditRef.current = openEdit;

  const lastOpenedTaskFromUrl = useRef<string | null>(null);
  useEffect(() => {
    if (loading) return;
    const taskId = searchParams.get("task");
    if (!taskId) {
      lastOpenedTaskFromUrl.current = null;
      return;
    }
    if (lastOpenedTaskFromUrl.current === taskId) return;
    const todo = todos.find((t) => t.id === taskId);
    if (!todo) return;
    lastOpenedTaskFromUrl.current = taskId;
    openEditRef.current(todo);
    router.replace("/todos", { scroll: false });
  }, [loading, todos, searchParams, router]);

  const onEditAutoSaved = useCallback(
    (updated: Todo) => {
      replaceTodoInLists(updated);
      setEditingTodo(updated);
    },
    [replaceTodoInLists],
  );

  const { saving: editAutoSaving, syncBaseline, flush } = useTaskEditAutoSave({
    editingTodo,
    editForm,
    onSaved: onEditAutoSaved,
    onError: (msg) => toast.error(msg),
  });

  const closeEditModal = useCallback(async () => {
    await flush();
    setEditingTodo(null);
    getCommentCounts().then(setCommentCounts).catch(() => {});
  }, [flush]);

  const persistEditTags = useCallback(
    async (tags: string[]) => {
      if (!editingTodo) return;
      const updated = await updateTodo(editingTodo.id, { tags });
      setEditForm((f) => ({ ...f, tags: updated.tags ?? tags }));
      setEditingTodo(updated);
      replaceTodoInLists(updated);
      syncBaseline();
    },
    [editingTodo, replaceTodoInLists, syncBaseline],
  );

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
          [...mine, ...assigned, ...archived].forEach((todo) => {
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
  }, [meUid, resolveUser, refreshKey]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (createInFlightRef.current) return;
    setFormError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFormError(t("todos.titleRequired"));
      return;
    }
    if (!meUid) {
      toast.error(t("toast.notSignedIn"));
      return;
    }

    createInFlightRef.current = true;
    setSubmitting(true);

    const tmpId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? `__tmp__${crypto.randomUUID()}`
        : `__tmp__${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const now = new Date().toISOString();
    const tmpTodo: Todo = {
      id: tmpId,
      userId: meUid,
      parentId: null,
      projectId: selectedProjectId,
      phaseId: null,
      assignedTo: assignedUser?.uid ?? null,
      assignmentStatus: null,
      title: trimmedTitle,
      priority,
      effort,
      estimatedMinutes: null,
      startDate: null,
      deadline: deadline || null,
      tags: [],
      scheduledSlot: null,
      suggestedSlot: null,
      recurrence: null,
      sortOrder: null,
      status: "active",
      statusChangedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    setMyTodos((prev) => [tmpTodo, ...prev]);
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

    try {
      const created = await createTodo({
        title: tmpTodo.title,
        priority: tmpTodo.priority,
        effort: tmpTodo.effort,
        deadline: tmpTodo.deadline,
        projectId: tmpTodo.projectId,
        assignedTo: tmpTodo.assignedTo,
      });
      setMyTodos((prev) => prev.map((t) => t.id === tmpId ? created : t));
      setJustCreatedId(created.id);
      setTimeout(() => setJustCreatedId(null), 10000);
    } catch (err) {
      setMyTodos((prev) => prev.filter((t) => t.id !== tmpId));
      setFormError(err instanceof Error ? err.message : "Impossible de créer la tâche");
    } finally {
      createInFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const handleStatusChange = useCallback(async (todo: Todo, newStatus: TodoStatus) => {
    const previousStatus = todo.status;
    const optimistic = { ...todo, status: newStatus };
    replaceTodoInLists(optimistic);
    try {
      const updated = await updateTodo(todo.id, { status: newStatus });
      replaceTodoInLists(updated);
      setLastAction({ todoId: todo.id, previousStatus });
    } catch {
      const rollback = (prev: Todo[]) => {
        const i = prev.findIndex((x) => x.id === todo.id);
        if (i === -1) return prev;
        if (prev[i].status !== newStatus) return prev;
        return replaceTodoInArray(prev, todo);
      };
      setMyTodos(rollback);
      setAssignedTodos(rollback);
      toast.error(t("toast.updateError"));
    }
  }, [toast, replaceTodoInLists, t]);

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
        replaceTodoInLists(restored);
        setLastAction({ todoId: todo.id, previousStatus });
      } else {
        const subs = getSubtasks(todo.id);
        if (subs.length > 0) {
          if (mode === "promote") {
            const promoted = await Promise.all(subs.map((s) => updateTodo(s.id, { parentId: null })));
            mergeTodosIntoLists(promoted);
          } else {
            const deleted = await Promise.all(subs.map((s) => deleteTodo(s.id)));
            mergeTodosIntoLists(deleted);
          }
        }
        const updated = await deleteTodo(todo.id);
        replaceTodoInLists(updated);
        setLastAction({ todoId: todo.id, previousStatus });
      }
    } catch {
      toast.error(t("toast.deleteError"));
    }
  };

  const handleDecline = useCallback(async (todo: Todo) => {
    try {
      const updated = await updateTodo(todo.id, { assignmentStatus: "declined" });
      replaceTodoInLists(updated);
    } catch {
      toast.error(t("toast.declineError"));
    }
  }, [toast, replaceTodoInLists, t]);

  const handleAccept = useCallback(async (todo: Todo) => {
    try {
      const updated = await updateTodo(todo.id, { assignmentStatus: "accepted" });
      replaceTodoInLists(updated);
    } catch {
      toast.error(t("toast.acceptError"));
    }
  }, [toast, replaceTodoInLists, t]);

  const handleUndo = async () => {
    if (!lastAction || undoing) return;
    setUndoing(true);
    try {
      const updated = await updateTodo(lastAction.todoId, { status: lastAction.previousStatus });
      replaceTodoInLists(updated);
      setLastAction(null);
    } catch {
      toast.error(t("toast.cancelError"));
    } finally {
      setUndoing(false);
    }
  };

  const getSubtasks = (parentId: string) => subtasksByParent[parentId] ?? [];

  const handleCreateSubtask = async (data: { title: string; priority: Priority; effort: Effort; startDate: string; deadline: string }) => {
    if (!subtaskParent) return;
    setSubtaskSubmitting(true);
    try {
      const todo = await createTodo({
        title: data.title,
        priority: data.priority,
        effort: data.effort,
        startDate: data.startDate || null,
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

  const handleScheduleUpdate = useCallback((updated: Todo) => {
    replaceTodoInLists(updated);
  }, [replaceTodoInLists]);

  const [meetLoadingId, setMeetLoadingId] = useState<string | null>(null);
  const [meetOptionsTodo, setMeetOptionsTodo] = useState<Todo | null>(null);
  const [meetStart, setMeetStart] = useState("");
  const [meetDuration, setMeetDuration] = useState(60);
  const [meetSummary, setMeetSummary] = useState("");
  const [meetDescription, setMeetDescription] = useState("");
  const [meetInviteEmail, setMeetInviteEmail] = useState("");
  const [meetInvitees, setMeetInvitees] = useState<string[]>([]);
  const [meetSlotOptions, setMeetSlotOptions] = useState<Array<{ label: string; start: string; end: string }>>([]);
  const [meetSlotLoading, setMeetSlotLoading] = useState(false);

  const addMeetInvitee = useCallback((emailInput: string) => {
    const email = emailInput.trim().toLowerCase();
    if (!email || !email.includes("@") || email.length < 5) return;
    setMeetInvitees((prev) => (prev.includes(email) ? prev : [...prev, email]));
    setMeetInviteEmail("");
  }, []);

  const openMeetOptions = useCallback(async (todo: Todo) => {
    setMeetOptionsTodo(todo);
    setMeetInvitees([]);
    setMeetInviteEmail("");
    setMeetDescription("");
    setMeetSummary(todo.title);
    setMeetSlotOptions([]);

    if (todo.scheduledSlot?.start && todo.scheduledSlot?.end) {
      const startDate = new Date(todo.scheduledSlot.start);
      const endDate = new Date(todo.scheduledSlot.end);
      const durationMin = Math.max(15, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
      setMeetStart(formatIsoForDateTimeInputInZone(todo.scheduledSlot.start, userTimeZone));
      setMeetDuration(durationMin);
      return;
    }

    setMeetSlotLoading(true);
    try {
      const data = await getTaskSlots(todo.id);
      const slots = data.slots ?? [];
      setMeetSlotOptions(slots.map((s) => ({ label: s.label, start: s.start, end: s.end })));
      if (slots.length > 0) {
        const start = slots[0]!.start;
        const end = slots[0]!.end;
        const durationMin = Math.max(15, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
        setMeetStart(formatIsoForDateTimeInputInZone(start, userTimeZone));
        setMeetDuration(durationMin);
      } else {
        const now = new Date();
        const rounded = new Date(now.getTime() + 15 * 60000 - (now.getTime() % (15 * 60000)));
        setMeetStart(formatIsoForDateTimeInputInZone(rounded.toISOString(), userTimeZone));
        setMeetDuration(60);
      }
    } catch {
      const now = new Date();
      const rounded = new Date(now.getTime() + 15 * 60000 - (now.getTime() % (15 * 60000)));
      setMeetStart(formatIsoForDateTimeInputInZone(rounded.toISOString(), userTimeZone));
      setMeetDuration(60);
    } finally {
      setMeetSlotLoading(false);
    }
  }, [userTimeZone]);

  const closeMeetOptions = useCallback(() => {
    setMeetOptionsTodo(null);
    setMeetSlotOptions([]);
    setMeetInvitees([]);
    setMeetInviteEmail("");
  }, []);

  const handleMeet = useCallback(async (todo: Todo) => {
    const url = todo.scheduledSlot?.meetingUrl;
    if (url) { window.open(url, "_blank", "noopener"); return; }
    await openMeetOptions(todo);
  }, [openMeetOptions]);

  const handleCreateMeetWithOptions = useCallback(async () => {
    if (!meetOptionsTodo || !meetStart) return;
    setMeetLoadingId(meetOptionsTodo.id);
    try {
      const startIso = wallTimeInZoneToIso(meetStart, userTimeZone);
      const endIso = new Date(new Date(startIso).getTime() + meetDuration * 60000).toISOString();
      const updated = await createTaskMeet(meetOptionsTodo.id, {
        start: startIso,
        end: endIso,
        attendees: meetInvitees,
        summary: meetSummary.trim() || meetOptionsTodo.title,
        description: meetDescription.trim() || undefined,
      });
      replaceTodoInLists(updated);
      const meetUrl = updated.scheduledSlot?.meetingUrl;
      if (meetUrl) {
        await navigator.clipboard.writeText(meetUrl).catch(() => null);
        toast.success(t("meet.created"));
      }
      closeMeetOptions();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(t(mapMeetErrorToMessageKey(msg)));
    } finally {
      setMeetLoadingId(null);
    }
  }, [meetOptionsTodo, meetStart, meetDuration, meetInvitees, meetSummary, meetDescription, replaceTodoInLists, toast, t, closeMeetOptions, userTimeZone]);

  const handleReorder = useCallback(async (orderedIds: string[]) => {
    try {
      await reorderTodosApi(orderedIds);
    } catch {
      toast.error(t("toast.reorderError"));
    }
  }, [toast, t]);

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
      replaceTodoInLists(updated);
    } catch {
      toast.error(t("toast.genericError"));
    }
  };

  const handleReorderSubtasks = async (orderedIds: string[]) => {
    setMyTodos((prev) => applySortOrderPatchToList(prev, orderedIds));
    setAssignedTodos((prev) => applySortOrderPatchToList(prev, orderedIds));
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
          // Task matches "no deadline" only when it has neither a deadline nor a slot.
          if (!hasNoEffectiveDue(t)) return false;
        } else {
          // For all other deadline filters, use the effective due day (min of deadline and slot).
          const dueDay = getEffectiveDueDay(t);
          if (!dueDay) return false;
          if (filterDeadline === "today" && dueDay > endOfToday) return false;
          if (filterDeadline === "week" && dueDay > endOfWeek) return false;
          if (filterDeadline === "overdue" && dueDay >= now) return false;
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
    "do-first": activeTodos.filter((t) => classify(t, nowMs) === "do-first"),
    schedule: activeTodos.filter((t) => classify(t, nowMs) === "schedule"),
    delegate: activeTodos.filter((t) => classify(t, nowMs) === "delegate"),
    eliminate: activeTodos.filter((t) => classify(t, nowMs) === "eliminate"),
  }), [activeTodos, nowMs]);

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
    return [...source].sort((a, b) => compareTodosForRadarList(a, b, radarMode, nowMs));
  }, [filters.size, activeTodos, listTodos, radarMode, nowMs]);

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
          className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-3 sm:p-5 shadow-sm"
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
              <ContactEmailSuggestInput
                className="col-span-2 sm:flex-1 sm:min-w-[200px]"
                value={assignEmail}
                onChange={handleAssignLookup}
                placeholder={t("assign.placeholder")}
                inputClassName={`w-full rounded border px-3 py-2 sm:py-2.5 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:outline-none focus:ring-1 h-[38px] sm:h-[42px] ${
                  assignedUser
                    ? "border-green-400 dark:border-green-600 focus:border-green-500 focus:ring-green-500"
                    : assignError
                      ? "border-red-400 dark:border-red-600 focus:border-red-500 focus:ring-red-500"
                      : "border-zinc-300 dark:border-slate-600 focus:border-slate-700 dark:focus:border-slate-400 focus:ring-slate-700 dark:focus:ring-slate-400"
                }`}
                rightAdornment={
                  assignedUser ? (
                    <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : undefined
                }
              />
            </div>
          </div>
          {formError && (
            <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {formError}
            </p>
          )}
        </form>

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
                  { text: t("help.todos.dnd") },
                  { text: t("help.todos.edit") },
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
              <ExportImportDropdown
                exportCsv={() => exportTasks("csv")}
                exportJson={() => exportTasks("json")}
                onImportFile={(f) => setTaskImportFile(f)}
                templateCsv={'title,status,priority,effort,estimatedMinutes,startDate,deadline,tags,projectId,phaseId,assignedTo\nMy task,active,medium,medium,,2025-06-01,2025-06-15,"tag1, tag2",,,'}
                templateJson={JSON.stringify([{ title: "My task", status: "active", priority: "medium", effort: "medium", deadline: "2025-06-15", tags: ["tag1"] }], null, 2)}
              />
              <TaskImportModal
                file={taskImportFile}
                open={taskImportFile !== null}
                onClose={() => setTaskImportFile(null)}
                onSuccess={bumpRefresh}
              />
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

        {/* ── Filters panel (collapsible) — below task list toolbar, above table/matrix ── */}
        <div className="rounded-md border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden mb-4">
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

          {mainView === "list" ? (
            <TaskList
              todos={listTodos}
              allTodos={todos}
              sortCol={sortCol}
              sortDir={sortDir}
              nowMs={nowMs}
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
              onMeet={handleMeet}
              meetLoadingId={meetLoadingId}
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
                        <TodoCard key={todo.id} todo={todo} onComplete={(t) => handleStatusChange(t, t.status === "completed" ? "active" : "completed")} onDelete={(t) => requestDelete(t)} onCancel={(t) => handleStatusChange(t, t.status === "cancelled" ? "active" : "cancelled")} onSubtask={openSubtaskModal} onDecline={handleDecline} onAccept={handleAccept} onEdit={openEdit} onScheduleUpdate={handleScheduleUpdate} onCreateNote={handleNoteAction} hasLinkedNote={!!todoNoteIds[todo.id]} justCreatedId={justCreatedId} subtaskCount={getSubtasks(todo.id).length} nowMs={nowMs} meUid={meUid} userDisplayName={userDisplayName} commentCount={commentCounts[todo.id] ?? 0} projects={projects} />
                      ))}
                    </div>
                  )}
                </div>
              ) : filters.size > 0 && activeQuadrantFilters.length > 0 ? (
                /* Quadrant filters: show selected quadrants expanded */
                <div className={`grid gap-2 ${activeQuadrantFilters.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
                  {activeQuadrantFilters.map((q) => (
                    <div key={q} className="rounded overflow-hidden">
                      <QuadrantCell quadrant={q} todos={grouped[q]} allTodos={todos} onComplete={(t) => handleStatusChange(t, "completed")} onDelete={(t) => requestDelete(t)} onCancel={(t) => handleStatusChange(t, t.status === "cancelled" ? "active" : "cancelled")} onSubtask={openSubtaskModal} onDecline={handleDecline} onAccept={handleAccept} onEdit={openEdit} onScheduleUpdate={handleScheduleUpdate} subtaskCounts={subtaskCounts} commentCounts={commentCounts} todoNoteIds={todoNoteIds} onCreateNote={handleNoteAction} justCreatedId={justCreatedId} nowMs={nowMs} meUid={meUid} userDisplayName={userDisplayName} projects={projects} />
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
                          <TodoCard key={todo.id} todo={todo} onComplete={(t) => handleStatusChange(t, t.status === "completed" ? "active" : "completed")} onDelete={(t) => requestDelete(t)} onCancel={(t) => handleStatusChange(t, t.status === "cancelled" ? "active" : "cancelled")} onSubtask={openSubtaskModal} onDecline={handleDecline} onAccept={handleAccept} onEdit={openEdit} onScheduleUpdate={handleScheduleUpdate} onCreateNote={handleNoteAction} hasLinkedNote={!!todoNoteIds[todo.id]} justCreatedId={justCreatedId} subtaskCount={getSubtasks(todo.id).length} nowMs={nowMs} meUid={meUid} userDisplayName={userDisplayName} commentCount={commentCounts[todo.id] ?? 0} projects={projects} />
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
                      <QuadrantCell quadrant="schedule" todos={grouped.schedule} allTodos={todos} onComplete={(t) => handleStatusChange(t, "completed")} onDelete={(t) => requestDelete(t)} onCancel={(t) => handleStatusChange(t, t.status === "cancelled" ? "active" : "cancelled")} onSubtask={openSubtaskModal} onDecline={handleDecline} onAccept={handleAccept} onEdit={openEdit} onScheduleUpdate={handleScheduleUpdate} subtaskCounts={subtaskCounts} commentCounts={commentCounts} todoNoteIds={todoNoteIds} onCreateNote={handleNoteAction} justCreatedId={justCreatedId} nowMs={nowMs} meUid={meUid} userDisplayName={userDisplayName} projects={projects} />
                    </div>
                    <div className="rounded overflow-hidden">
                      <QuadrantCell quadrant="do-first" todos={grouped["do-first"]} allTodos={todos} onComplete={(t) => handleStatusChange(t, "completed")} onDelete={(t) => requestDelete(t)} onCancel={(t) => handleStatusChange(t, t.status === "cancelled" ? "active" : "cancelled")} onSubtask={openSubtaskModal} onDecline={handleDecline} onAccept={handleAccept} onEdit={openEdit} onScheduleUpdate={handleScheduleUpdate} subtaskCounts={subtaskCounts} commentCounts={commentCounts} todoNoteIds={todoNoteIds} onCreateNote={handleNoteAction} justCreatedId={justCreatedId} nowMs={nowMs} meUid={meUid} userDisplayName={userDisplayName} projects={projects} />
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
                      <QuadrantCell quadrant="eliminate" todos={grouped.eliminate} allTodos={todos} onComplete={(t) => handleStatusChange(t, "completed")} onDelete={(t) => requestDelete(t)} onCancel={(t) => handleStatusChange(t, t.status === "cancelled" ? "active" : "cancelled")} onSubtask={openSubtaskModal} onDecline={handleDecline} onAccept={handleAccept} onEdit={openEdit} onScheduleUpdate={handleScheduleUpdate} subtaskCounts={subtaskCounts} commentCounts={commentCounts} todoNoteIds={todoNoteIds} onCreateNote={handleNoteAction} justCreatedId={justCreatedId} nowMs={nowMs} meUid={meUid} userDisplayName={userDisplayName} projects={projects} />
                    </div>
                    <div className="rounded overflow-hidden">
                      <QuadrantCell quadrant="delegate" todos={grouped.delegate} allTodos={todos} onComplete={(t) => handleStatusChange(t, "completed")} onDelete={(t) => requestDelete(t)} onCancel={(t) => handleStatusChange(t, t.status === "cancelled" ? "active" : "cancelled")} onSubtask={openSubtaskModal} onDecline={handleDecline} onAccept={handleAccept} onEdit={openEdit} onScheduleUpdate={handleScheduleUpdate} subtaskCounts={subtaskCounts} commentCounts={commentCounts} todoNoteIds={todoNoteIds} onCreateNote={handleNoteAction} justCreatedId={justCreatedId} nowMs={nowMs} meUid={meUid} userDisplayName={userDisplayName} projects={projects} />
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-md shadow-sm border border-zinc-200 dark:border-slate-700 p-6">
              <div className="flex flex-col md:flex-row gap-6">
                {/* Priority list */}
                <div className="w-full md:w-96 md:max-w-full md:shrink-0">
                  <h3 className="text-sm font-semibold text-zinc-700 dark:text-slate-300 mb-3 flex items-center gap-1.5 flex-wrap">
                    {filters.size === 0 ? (
                      <>
                        {t("todos.priorities")}
                        <span className="text-zinc-500 dark:text-slate-500 font-normal">
                          · {t(RADAR_MODE_LABEL_KEYS[radarMode])}
                        </span>
                      </>
                    ) : (
                      [...filters].map((f) => { const btn = FILTER_BUTTONS.find((b) => b.key === f); return btn ? t(btn.tKey) : f; }).join(", ")
                    )}
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
                        const q = classify(todo, nowMs);
                        const dl = todo.deadline ? deadlineLabel(todo.deadline, t) : null;
                        return (
                          <div
                            key={todo.id}
                            onClick={(e) => { e.preventDefault(); openEdit(todo); }}
                            className={`group/card flex items-start gap-2 rounded border px-2.5 py-2 cursor-pointer select-none ${CARD_BG[q]}`}
                          >
                            <span className="text-xs font-bold text-zinc-400 dark:text-slate-500 pt-0.5 w-4 text-right shrink-0 tabular-nums">
                              {i + 1}
                            </span>
                            <div className="flex-1 min-w-0 flex flex-col gap-1.5 items-stretch">
                              <p className="text-sm font-medium text-zinc-900 dark:text-slate-100 leading-snug line-clamp-2">
                                {displayTodoTitle(todo.title, t("todos.untitled"))}
                              </p>
                              <div className="flex items-center gap-1 flex-wrap gap-y-1">
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
                            <div className="shrink-0 self-start pt-0.5">
                              {todo.status === "active" ? (
                                <TaskIconToolbar
                                  todo={todo}
                                  meUid={meUid}
                                  projects={projects}
                                  commentCount={commentCounts[todo.id] ?? 0}
                                  onComplete={(t) => handleStatusChange(t, "completed")}
                                  onSubtask={openSubtaskModal}
                                  onScheduleUpdate={handleScheduleUpdate}
                                  onCancel={(t) => handleStatusChange(t, "cancelled")}
                                  onDecline={handleDecline}
                                  onAccept={handleAccept}
                                  onEdit={openEdit}
                                  onDelete={requestDelete}
                                  onCreateNote={handleNoteAction}
                                  hasLinkedNote={!!todoNoteIds[todo.id]}
                                  justCreatedId={justCreatedId}
                                  suggestedSlot={todo.suggestedSlot}
                                  isolatePointerEvents
                                  variant="radar"
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleStatusChange(todo, "active"); }}
                                  title={t("todos.reactivate")}
                                  className="inline-flex items-center gap-0.5 rounded border border-green-300 dark:border-green-700 px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/40 transition-colors w-[6.75rem] justify-center"
                                >
                                  <svg className="w-2.5 h-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
                                  </svg>
                                  {t("todos.reactivate")}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

                {/* Radar */}
                <div className="flex-1 min-w-0">
                  <EisenhowerRadar
                    todos={activeTodos}
                    subtaskCounts={subtaskCounts}
                    meUid={meUid}
                    userDisplayName={userDisplayName}
                    radarMode={radarMode}
                    onRadarModeChange={setRadarMode}
                    nowMs={nowMs}
                    onEditTask={openEdit}
                  />
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
        onClose={closeEditModal}
        saving={editAutoSaving}
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
        isTaskOwner={!editingTodo || editingTodo.userId === user?.uid}
        onAcceptDecline={editingTodo ? (status) => {
          if (status === "accepted") handleAccept(editingTodo);
          else handleDecline(editingTodo);
          closeEditModal();
        } : undefined}
        onSuggestedSlotChange={editingTodo && editingTodo.userId === user?.uid && editingTodo.assignedTo ? async (slot) => {
          try {
            const updated = await updateTodo(editingTodo.id, { suggestedSlot: slot });
            replaceTodoInLists(updated);
            setEditingTodo(updated);
          } catch { /* handled by API layer */ }
        } : undefined}
        onPersistTags={persistEditTags}
        onTodoCommentsChanged={() => {
          getCommentCounts().then(setCommentCounts).catch(() => {});
        }}
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

      {meetOptionsTodo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={closeMeetOptions}>
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-2xl border border-zinc-200 dark:border-slate-700 w-full max-w-lg mx-4 p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-zinc-900 dark:text-slate-100">{t("meet.optionsTitle")}</h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-slate-400 truncate">{displayTodoTitle(meetOptionsTodo.title, t("todos.untitled"))}</p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("meet.summary")}</label>
                <input
                  value={meetSummary}
                  onChange={(e) => setMeetSummary(e.target.value)}
                  className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("meet.slot")}</label>
                {meetSlotLoading ? (
                  <p className="text-xs text-zinc-400 dark:text-slate-500">{t("loading")}</p>
                ) : (
                  <div className="space-y-2">
                    {meetSlotOptions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {meetSlotOptions.slice(0, 4).map((slot) => (
                          <button
                            key={`${slot.start}-${slot.end}`}
                            type="button"
                            onClick={() => {
                              const durationMin = Math.max(15, Math.round((new Date(slot.end).getTime() - new Date(slot.start).getTime()) / 60000));
                              setMeetStart(formatIsoForDateTimeInputInZone(slot.start, userTimeZone));
                              setMeetDuration(durationMin);
                            }}
                            className="text-xs rounded border border-zinc-300 dark:border-slate-600 px-2 py-1 text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800"
                          >
                            {slot.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-zinc-400 dark:text-slate-500 mb-1">{t("meet.start")}</label>
                        <input
                          type="datetime-local"
                          value={meetStart}
                          onChange={(e) => setMeetStart(e.target.value)}
                          className="w-full rounded border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-sm dark:bg-slate-800 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-zinc-400 dark:text-slate-500 mb-1">{t("meet.duration")}</label>
                        <select
                          value={meetDuration}
                          onChange={(e) => setMeetDuration(Number(e.target.value))}
                          className="w-full rounded border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-sm dark:bg-slate-800 dark:text-slate-100"
                        >
                          <option value={30}>30 min</option>
                          <option value={45}>45 min</option>
                          <option value={60}>60 min</option>
                          <option value={90}>90 min</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("meet.invitees")}</label>
                <div className="flex items-center gap-2">
                  <ContactEmailSuggestInput
                    value={meetInviteEmail}
                    onChange={setMeetInviteEmail}
                    placeholder={t("assign.placeholder")}
                    inputClassName="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => addMeetInvitee(meetInviteEmail)}
                    className="rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-xs text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800"
                  >
                    {t("meet.addInvitee")}
                  </button>
                </div>
                {meetInvitees.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {meetInvitees.map((email) => (
                      <button
                        key={email}
                        type="button"
                        onClick={() => setMeetInvitees((prev) => prev.filter((e) => e !== email))}
                        className="text-[11px] rounded-full px-2 py-0.5 bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                        title={t("notes.attachDelete")}
                      >
                        {email} ×
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("meet.description")}</label>
                <textarea
                  value={meetDescription}
                  onChange={(e) => setMeetDescription(e.target.value)}
                  rows={3}
                  className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeMeetOptions}
                className="rounded border border-zinc-300 dark:border-slate-600 px-4 py-2 text-sm text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800"
              >
                {t("projects.cancel")}
              </button>
              <button
                type="button"
                onClick={handleCreateMeetWithOptions}
                disabled={!meetStart || meetLoadingId === meetOptionsTodo.id}
                className="rounded bg-slate-700 dark:bg-slate-600 px-4 py-2 text-sm font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-60"
              >
                {meetLoadingId === meetOptionsTodo.id ? "…" : t("meet.createAction")}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

