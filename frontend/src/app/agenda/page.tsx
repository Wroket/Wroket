"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthContext";
import PageHelpButton from "@/components/PageHelpButton";
import TaskEditModal from "@/components/TaskEditModal";
import DeleteTaskDialog from "@/components/DeleteTaskDialog";
import ContactEmailSuggestInput from "@/components/ContactEmailSuggestInput";
import { useToast } from "@/components/Toast";
import { useTaskEditAutoSave } from "@/lib/useTaskEditAutoSave";
import {
  getCalendarEvents,
  getMe,
  getTodos,
  getAssignedTodos,
  getProjects,
  createTodo,
  updateTodo,
  deleteTodo,
  bookTaskSlot,
  lookupUser,
  getInAppScheduledSlotsPendingCount,
  syncInAppScheduledSlotsToCalendar,
  type CalendarEvent,
  type Todo,
  type Project,
  type Priority,
  type Effort,
  type AuthMeResponse,
  type Recurrence,
  type GoogleAccountPublic,
  type MicrosoftAccountPublic,
  type SlotConflict,
} from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import { personalTaskCreateBlocked } from "@/lib/freeQuota";
import { useUserLookup } from "@/lib/userUtils";
import { useResourceSync, broadcastResourceChange } from "@/lib/useResourceSync";
import { broadcastTodosMutated } from "@/lib/todoSyncBroadcast";
import { getPhaseSlotDateBounds, isSlotWithinPhaseLocalDays } from "@/lib/phaseSlotBounds";
import { findAgendaDayElement, snappedStartEndFromPointerLocal } from "./_utils/agendaSlotPointer";
import {
  HOUR_HEIGHT,
  DAY_START_HOUR,
  DAY_END_HOUR,
  TOTAL_HOURS,
  ACCOUNT_COLORS,
  QUADRANT_COLORS,
  classifyEvent,
  getEventPositionForDay,
  eventVisibleOnCalendarDay,
  isSameDay,
  formatHour,
  hexToTintBg,
} from "./_utils/calendarUtils";
import { meetingJoinI18nKey } from "@/lib/meetingJoinLabel";

export default function AgendaPage() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const { resolveUser, displayName, cacheRef: userCacheRef } = useUserLookup();
  type ViewMode = "day" | "week" | "month";
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [wroketEvents, setWroketEvents] = useState<CalendarEvent[]>([]);
  const [googleEvents, setGoogleEvents] = useState<CalendarEvent[]>([]);
  const [microsoftEvents, setMicrosoftEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [googleAccounts, setGoogleAccounts] = useState<GoogleAccountPublic[]>([]);
  const [microsoftAccounts, setMicrosoftAccounts] = useState<MicrosoftAccountPublic[]>([]);
  const [hiddenAccounts, setHiddenAccounts] = useState<Set<string>>(new Set());
  const [calendarMenuOpen, setCalendarMenuOpen] = useState(false);
  const calendarMenuRef = useRef<HTMLDivElement>(null);
  const timeGridScrollRef = useRef<HTMLDivElement>(null);
  const [timeGridScrollbarW, setTimeGridScrollbarW] = useState(0);
  const [now, setNow] = useState(new Date());

  const [projects, setProjects] = useState<Project[]>([]);
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [quickCreateDate, setQuickCreateDate] = useState("");
  const [quickCreateTime, setQuickCreateTime] = useState("");
  const [quickCreateTitle, setQuickCreateTitle] = useState("");
  const [quickCreatePriority, setQuickCreatePriority] = useState<Priority>("medium");
  const [quickCreateEffort, setQuickCreateEffort] = useState<Effort>("medium");
  const [quickCreateProjectId, setQuickCreateProjectId] = useState<string | null>(null);
  const [quickCreateAssignEmail, setQuickCreateAssignEmail] = useState("");
  const [quickCreateAssignedUser, setQuickCreateAssignedUser] = useState<AuthMeResponse | null>(null);
  const [quickCreateAssignError, setQuickCreateAssignError] = useState<string | null>(null);
  const [quickCreateDuration, setQuickCreateDuration] = useState(30);
  const [quickCreating, setQuickCreating] = useState(false);
  const quickAssignTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [deleteTaskDialog, setDeleteTaskDialog] = useState<{ todo: Todo; subtaskCount: number } | null>(null);
  const [editForm, setEditForm] = useState({ title: "", priority: "medium" as Priority, effort: "medium" as Effort, startDate: "", deadline: "", assignedTo: "" as string | null, estimatedMinutes: null as number | null, tags: [] as string[], recurrence: null as Recurrence | null, projectId: null as string | null });
  const [editAssignEmail, setEditAssignEmail] = useState("");
  const [editAssignedUser, setEditAssignedUser] = useState<AuthMeResponse | null>(null);
  const [editAssignError, setEditAssignError] = useState<string | null>(null);
  const editAssignLookupTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [syncBannerRunning, setSyncBannerRunning] = useState(false);

  const accountColorMap = useMemo(() => {
    const map = new Map<string, string>();
    const combined = [...googleAccounts, ...microsoftAccounts];
    combined.forEach((acc, i) => {
      map.set(acc.email, ACCOUNT_COLORS[i % ACCOUNT_COLORS.length]);
    });
    return map;
  }, [googleAccounts, microsoftAccounts]);

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
        result.push({ id: child.id, label: `  ↳ ${child.name}` });
      }
    }
    return result;
  }, [projects]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const [agendaTodoById, setAgendaTodoById] = useState<Map<string, Todo>>(new Map());
  const [bookingMoveId, setBookingMoveId] = useState<string | null>(null);
  const [dragConflict, setDragConflict] = useState<{
    todoId: string;
    start: string;
    end: string;
    conflicts: SlotConflict[];
  } | null>(null);

  const dragSessionRef = useRef<{
    todoId: string;
    startX: number;
    startY: number;
    origStartMs: number;
    origEndMs: number;
    dragging: boolean;
  } | null>(null);
  const suppressNextWroketClickRef = useRef(false);

  const refreshAgendaTodos = useCallback(async () => {
    try {
      const [owned, assigned] = await Promise.all([getTodos(), getAssignedTodos()]);
      const m = new Map<string, Todo>();
      for (const t of owned) m.set(t.id, t);
      for (const t of assigned) m.set(t.id, t);
      setAgendaTodoById(m);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [me, projs, owned, assigned] = await Promise.all([
          getMe(),
          getProjects(),
          getTodos(),
          getAssignedTodos(),
        ]);
        if (!cancelled) {
          setGoogleAccounts(me.googleAccounts ?? []);
          setMicrosoftAccounts(me.microsoftAccounts ?? []);
          setProjects(projs.filter((p) => p.status === "active"));
          const m = new Map<string, Todo>();
          for (const t of owned) m.set(t.id, t);
          for (const t of assigned) m.set(t.id, t);
          setAgendaTodoById(m);
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (calendarMenuRef.current && !calendarMenuRef.current.contains(e.target as Node)) {
        setCalendarMenuOpen(false);
      }
    }
    if (calendarMenuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [calendarMenuOpen]);

  const weekDays = useMemo(() => {
    const d = new Date(currentDate);
    const day = d.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      return date;
    });
  }, [currentDate]);

  const visibleDays = useMemo(() => {
    if (viewMode === "day") {
      const d = new Date(currentDate);
      d.setHours(0, 0, 0, 0);
      return [d];
    }
    return weekDays;
  }, [viewMode, currentDate, weekDays]);

  const monthDays = useMemo(() => {
    if (viewMode !== "month") return [];
    const d = new Date(currentDate);
    const year = d.getFullYear();
    const month = d.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const start = new Date(firstDay);
    start.setDate(start.getDate() - startOffset);
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const dd = new Date(start);
      dd.setDate(start.getDate() + i);
      days.push(dd);
    }
    return days;
  }, [viewMode, currentDate]);

  const dateRange = useMemo(() => {
    if (viewMode === "month" && monthDays.length > 0) {
      const s = new Date(monthDays[0]);
      const e = new Date(monthDays[monthDays.length - 1]);
      e.setHours(23, 59, 59, 999);
      return { start: s.toISOString(), end: e.toISOString() };
    }
    const s = new Date(visibleDays[0]);
    const e = new Date(visibleDays[visibleDays.length - 1]);
    e.setHours(23, 59, 59, 999);
    return { start: s.toISOString(), end: e.toISOString() };
  }, [viewMode, visibleDays, monthDays]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await getCalendarEvents(dateRange.start, dateRange.end);
        if (!cancelled) {
          setWroketEvents(data.wroketEvents);
          setGoogleEvents(data.googleEvents);
          setMicrosoftEvents(data.microsoftEvents ?? []);
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [dateRange]);

  const goToday = useCallback(() => setCurrentDate(new Date()), []);
  const goPrev = useCallback(() => setCurrentDate((d) => {
    const n = new Date(d);
    if (viewMode === "day") n.setDate(n.getDate() - 1);
    else if (viewMode === "week") n.setDate(n.getDate() - 7);
    else n.setMonth(n.getMonth() - 1);
    return n;
  }), [viewMode]);
  const goNext = useCallback(() => setCurrentDate((d) => {
    const n = new Date(d);
    if (viewMode === "day") n.setDate(n.getDate() + 1);
    else if (viewMode === "week") n.setDate(n.getDate() + 7);
    else n.setMonth(n.getMonth() + 1);
    return n;
  }), [viewMode]);

  const toggleAccountVisibility = (email: string) => {
    setHiddenAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const visibleGoogleEvents = useMemo(
    () => googleEvents.filter((ev) => !ev.accountEmail || !hiddenAccounts.has(ev.accountEmail)),
    [googleEvents, hiddenAccounts],
  );

  const visibleMicrosoftEvents = useMemo(
    () => microsoftEvents.filter((ev) => !ev.accountEmail || !hiddenAccounts.has(ev.accountEmail)),
    [microsoftEvents, hiddenAccounts],
  );

  const allEvents = useMemo(
    () => [...wroketEvents, ...visibleGoogleEvents, ...visibleMicrosoftEvents],
    [wroketEvents, visibleGoogleEvents, visibleMicrosoftEvents],
  );

  const linkedCalendarCount = googleAccounts.length + microsoftAccounts.length;

  const canSyncExternalSlots = !!(user?.entitlements?.integrations && linkedCalendarCount > 0);

  useEffect(() => {
    if (!canSyncExternalSlots) {
      setPendingSyncCount(0);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { count } = await getInAppScheduledSlotsPendingCount();
        if (!cancelled) setPendingSyncCount(count);
      } catch {
        if (!cancelled) setPendingSyncCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canSyncExternalSlots, googleAccounts, microsoftAccounts]);

  const eventsForDay = useCallback(
    (day: Date, allDay: boolean) =>
      allEvents.filter((e) => e.allDay === allDay && eventVisibleOnCalendarDay(e, day)),
    [allEvents],
  );

  const headerLabel = useMemo(() => {
    const loc = locale === "fr" ? "fr-FR" : "en-US";
    if (viewMode === "day") {
      return new Intl.DateTimeFormat(loc, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(currentDate);
    }
    if (viewMode === "month") {
      return new Intl.DateTimeFormat(loc, { month: "long", year: "numeric" }).format(currentDate);
    }
    const fmt = new Intl.DateTimeFormat(loc, { day: "numeric", month: "long", year: "numeric" });
    const startDay = weekDays[0].getDate();
    const endParts = fmt.formatToParts(weekDays[6]);
    const endDay = endParts.find((p) => p.type === "day")?.value ?? "";
    const endMonth = endParts.find((p) => p.type === "month")?.value ?? "";
    const endYear = endParts.find((p) => p.type === "year")?.value ?? "";
    if (weekDays[0].getMonth() === weekDays[6].getMonth()) {
      return `${startDay} - ${endDay} ${endMonth} ${endYear}`;
    }
    return `${fmt.format(weekDays[0])} - ${fmt.format(weekDays[6])}`;
  }, [viewMode, currentDate, weekDays, locale]);

  const today = new Date();

  const currentTimeTop = useMemo(() => {
    const mins = (now.getHours() - DAY_START_HOUR) * 60 + now.getMinutes();
    return (mins / 60) * HOUR_HEIGHT;
  }, [now]);

  const hours = useMemo(() => Array.from({ length: TOTAL_HOURS }, (_, i) => DAY_START_HOUR + i), []);

  /** Vertical scrollbar on the time grid steals width from day columns; pad header rows so columns align. */
  useLayoutEffect(() => {
    const el = timeGridScrollRef.current;
    if (!el) {
      setTimeGridScrollbarW(0);
      return;
    }
    const measure = () => {
      setTimeGridScrollbarW(Math.max(0, el.offsetWidth - el.clientWidth));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading, viewMode, visibleDays.length]);

  const getAccountColor = (accountEmail?: string): string => {
    if (!accountEmail) return ACCOUNT_COLORS[0];
    return accountColorMap.get(accountEmail) ?? ACCOUNT_COLORS[0];
  };

  const externalEventTitle = (ev: CalendarEvent): string => {
    const fallback =
      ev.source === "microsoft" ? t("agenda.microsoftEvent") : t("agenda.googleEvent");
    return `${ev.summary} (${ev.accountEmail ?? fallback})`;
  };

  // ── Quick create on double-click ──

  const handleQuickAssignLookup = (email: string) => {
    setQuickCreateAssignEmail(email);
    setQuickCreateAssignError(null);
    clearTimeout(quickAssignTimer.current);
    if (!email.includes("@") || email.length < 5) {
      setQuickCreateAssignedUser(null);
      return;
    }
    quickAssignTimer.current = setTimeout(async () => {
      try {
        const found = await lookupUser(email);
        if (found) {
          setQuickCreateAssignedUser(found);
        } else {
          setQuickCreateAssignedUser(null);
          setQuickCreateAssignError(t("assign.notFound"));
        }
      } catch {
        setQuickCreateAssignedUser(null);
      }
    }, 400);
  };

  const getEffortDuration = useCallback((effort: Effort): number => {
    const defaultMinutes = { light: 10, medium: 30, heavy: 60 };
    const effortMap = user?.effortMinutes ?? defaultMinutes;
    return effortMap[effort] ?? 30;
  }, [user?.effortMinutes]);

  const handleDoubleClickSlot = (day: Date, hour: number, minutes: number) => {
    const y = day.getFullYear();
    const m = String(day.getMonth() + 1).padStart(2, "0");
    const d = String(day.getDate()).padStart(2, "0");
    setQuickCreateDate(`${y}-${m}-${d}`);
    setQuickCreateTime(`${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`);
    setQuickCreateTitle("");
    setQuickCreatePriority("medium");
    setQuickCreateEffort("medium");
    setQuickCreateDuration(getEffortDuration("medium"));
    setQuickCreateProjectId(null);
    setQuickCreateAssignEmail("");
    setQuickCreateAssignedUser(null);
    setQuickCreateAssignError(null);
    setShowQuickCreate(true);
  };

  const handleQuickCreate = async () => {
    if (!quickCreateTitle.trim() || quickCreating) return;
    if (personalTaskCreateBlocked(user, quickCreateProjectId, projects)) {
      toast.error(t("quota.free.taskLimitHint"));
      return;
    }
    setQuickCreating(true);
    try {
      const todo = await createTodo({
        title: quickCreateTitle.trim(),
        priority: quickCreatePriority,
        effort: quickCreateEffort,
        startDate: quickCreateDate,
        deadline: quickCreateDate,
        projectId: quickCreateProjectId,
        assignedTo: quickCreateAssignedUser?.uid ?? null,
      });

      const slotStart = new Date(`${quickCreateDate}T${quickCreateTime}:00`);
      const slotEnd = new Date(slotStart.getTime() + quickCreateDuration * 60_000);

      await bookTaskSlot(todo.id, slotStart.toISOString(), slotEnd.toISOString());

      setShowQuickCreate(false);
      toast.success(t("agenda.taskCreated"));
      broadcastTodosMutated();
      broadcastResourceChange("agenda");
      const data = await getCalendarEvents(dateRange.start, dateRange.end);
      setWroketEvents(data.wroketEvents);
      setGoogleEvents(data.googleEvents);
      setMicrosoftEvents(data.microsoftEvents ?? []);
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setQuickCreating(false);
    }
  };

  const handleSlotClick = (day: Date, e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const totalMinutes = (y / HOUR_HEIGHT) * 60;
    const hour = Math.floor(totalMinutes / 60) + DAY_START_HOUR;
    const minutes = Math.floor(totalMinutes % 60 / 15) * 15;
    handleDoubleClickSlot(day, Math.min(hour, DAY_END_HOUR - 1), minutes);
  };

  // ── Task editing ──

  const openWroketTaskFromCalendarEvent = async (ev: CalendarEvent) => {
    if (ev.source !== "wroket") return;
    try {
      const [owned, assigned] = await Promise.all([getTodos(), getAssignedTodos()]);
      const realId = ev.recurring ? ev.id.split("_rec_")[0] : ev.id;
      const todo = owned.find((t) => t.id === realId) ?? assigned.find((t) => t.id === realId);
      if (!todo) { toast.error(t("toast.taskNotFound")); return; }
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
    } catch {
      toast.error(t("toast.taskLoadError"));
    }
  };

  const refreshCalendarForRange = useCallback(async () => {
    const data = await getCalendarEvents(dateRange.start, dateRange.end);
    setWroketEvents(data.wroketEvents);
    setGoogleEvents(data.googleEvents);
    setMicrosoftEvents(data.microsoftEvents ?? []);
  }, [dateRange]);

  const commitSlotMove = useCallback(
    async (todoId: string, startIso: string, endIso: string, force?: boolean) => {
      setBookingMoveId(todoId);
      try {
        const result = await bookTaskSlot(todoId, startIso, endIso, force);
        if (result.conflict && result.conflicts?.length) {
          setDragConflict({ todoId, start: startIso, end: endIso, conflicts: result.conflicts });
          return;
        }
        if (result.todo) {
          setDragConflict(null);
          broadcastTodosMutated();
          broadcastResourceChange("agenda");
          toast.success(t("agenda.slotMoved"));
          setAgendaTodoById((prev) => {
            const next = new Map(prev);
            next.set(todoId, result.todo!);
            return next;
          });
          void refresh();
          await refreshCalendarForRange();
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("toast.updateError"));
      } finally {
        setBookingMoveId(null);
      }
    },
    [refreshCalendarForRange, refresh, toast, t],
  );

  const beginWroketDrag = useCallback(
    (ev: CalendarEvent, e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      if (ev.source !== "wroket" || ev.allDay) return;
      if (bookingMoveId) return;
      const el = e.currentTarget;
      const realId = ev.id.includes("_rec_") ? ev.id.split("_rec_")[0]! : ev.id;
      dragSessionRef.current = {
        todoId: realId,
        startX: e.clientX,
        startY: e.clientY,
        origStartMs: new Date(ev.start).getTime(),
        origEndMs: new Date(ev.end).getTime(),
        dragging: false,
      };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [bookingMoveId],
  );

  const moveWroketDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragSessionRef.current;
    if (!s) return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    if (!s.dragging && dx * dx + dy * dy > 64) s.dragging = true;
  }, []);

  const endWroketDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      try {
        if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const s = dragSessionRef.current;
      dragSessionRef.current = null;
      if (!s?.dragging) return;
      e.preventDefault();
      e.stopPropagation();
      suppressNextWroketClickRef.current = true;
      const dayEl = findAgendaDayElement(e.clientX, e.clientY);
      const ymd = dayEl?.dataset.agendaDay;
      if (!dayEl || !ymd) {
        toast.error(t("agenda.dropOutsideGrid"));
        return;
      }
      const durationMs = s.origEndMs - s.origStartMs;
      const { start, end } = snappedStartEndFromPointerLocal(dayEl, e.clientY, durationMs, ymd);
      if (
        Math.abs(new Date(start).getTime() - s.origStartMs) < 30_000 &&
        Math.abs(new Date(end).getTime() - s.origEndMs) < 30_000
      ) {
        return;
      }
      const todo = agendaTodoById.get(s.todoId);
      const bounds = getPhaseSlotDateBounds(todo, projects);
      if (!isSlotWithinPhaseLocalDays(bounds, new Date(start).getTime(), new Date(end).getTime())) {
        toast.error(t("agenda.slotOutsidePhase"));
        return;
      }
      void commitSlotMove(s.todoId, start, end, false);
    },
    [agendaTodoById, projects, commitSlotMove, toast, t],
  );

  const handleBannerSync = useCallback(async () => {
    if (syncBannerRunning) return;
    setSyncBannerRunning(true);
    try {
      const result = await syncInAppScheduledSlotsToCalendar({ skipIfConflict: true });
      broadcastResourceChange("todos");
      const skippedSuffix =
        result.skippedConflicts > 0
          ? t("agenda.inAppSlotsSyncSkippedSuffix").replace("{{n}}", String(result.skippedConflicts))
          : "";
      toast.success(
        t("agenda.inAppSlotsSyncSuccess")
          .replace("{{synced}}", String(result.synced))
          .replace("{{skipped}}", skippedSuffix),
      );
      if (result.synced === 0 && result.skippedConflicts > 0) {
        toast.info(t("agenda.inAppSlotsSyncAllSkippedConflicts"));
      }
      if (result.failed.length > 0) {
        let errMsg = t("agenda.inAppSlotsSyncPartialFailures").replace("{{n}}", String(result.failed.length));
        const detail = result.failed[0]?.message;
        if (detail) errMsg += t("agenda.inAppSlotsSyncFirstFailure").replace("{{detail}}", detail);
        toast.error(errMsg);
      }
      try {
        const { count } = await getInAppScheduledSlotsPendingCount();
        setPendingSyncCount(count);
      } catch {
        setPendingSyncCount(0);
      }
      await refreshCalendarForRange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("agenda.inAppSlotsSyncBannerSync"));
    } finally {
      setSyncBannerRunning(false);
    }
  }, [syncBannerRunning, t, toast, refreshCalendarForRange]);

  // Refresh when tab becomes visible or another tab mutates todos/calendar slots.
  useResourceSync("agenda", refreshCalendarForRange, { pollIntervalMs: 120_000 });
  useResourceSync("todos", refreshAgendaTodos, { pollIntervalMs: 120_000 });

  const onEditAutoSaved = useCallback(
    (updated: Todo) => {
      setEditingTodo(updated);
      void refreshCalendarForRange();
    },
    [refreshCalendarForRange],
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
    await refreshCalendarForRange();
  }, [flush, refreshCalendarForRange]);

  const persistEditTags = useCallback(
    async (tags: string[]) => {
      if (!editingTodo) return;
      const updated = await updateTodo(editingTodo.id, { tags });
      setEditForm((f) => ({ ...f, tags: updated.tags ?? tags }));
      setEditingTodo(updated);
      syncBaseline();
      await refreshCalendarForRange();
    },
    [editingTodo, refreshCalendarForRange, syncBaseline],
  );

  const handleExternalSlotSynced = useCallback(async () => {
    const id = editingTodo?.id;
    if (!id) return;
    try {
      const [owned, assigned] = await Promise.all([getTodos(), getAssignedTodos()]);
      const next = owned.find((t) => t.id === id) ?? assigned.find((t) => t.id === id);
      if (next) setEditingTodo(next);
      await refreshCalendarForRange();
      syncBaseline();
      if (canSyncExternalSlots) {
        try {
          const { count } = await getInAppScheduledSlotsPendingCount();
          setPendingSyncCount(count);
        } catch {
          setPendingSyncCount(0);
        }
      }
    } catch {
      await refreshCalendarForRange();
    }
  }, [editingTodo?.id, refreshCalendarForRange, syncBaseline, canSyncExternalSlots]);

  const executeAgendaDeleteTask = useCallback(
    async (mode: "promote" | "deleteAll") => {
      const row = deleteTaskDialog;
      if (!row) return;
      const todo = row.todo;
      setDeleteTaskDialog(null);
      try {
        const [owned, assigned] = await Promise.all([getTodos(), getAssignedTodos()]);
        const all = [...owned, ...assigned];
        const subs = all.filter((td) => td.parentId === todo.id);
        if (subs.length > 0) {
          if (mode === "promote") {
            await Promise.all(subs.map((s) => updateTodo(s.id, { parentId: null })));
          } else {
            await Promise.all(subs.map((s) => deleteTodo(s.id)));
          }
        }
        await deleteTodo(todo.id);
        await refreshCalendarForRange();
      } catch {
        toast.error(t("toast.deleteError"));
      }
    },
    [deleteTaskDialog, refreshCalendarForRange, toast, t],
  );

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
        const found = await lookupUser(email);
        if (found) {
          setEditAssignedUser(found);
          setEditForm((f) => ({ ...f, assignedTo: found.uid }));
        } else {
          setEditAssignedUser(null);
          setEditAssignError("Utilisateur introuvable");
        }
      } catch {
        setEditAssignedUser(null);
      }
    }, 400);
  };

  return (
    <AppShell>
      <div className="flex flex-col h-[calc(100vh-120px)]">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-zinc-900 dark:text-slate-100">{t("agenda.title")}</h1>
            <PageHelpButton
              title={t("agenda.title")}
              items={[
                { text: t("help.agenda.editTask") },
                { text: t("help.agenda.dragWroket") },
                { text: t("help.agenda.quickCreate") },
                { text: t("help.agenda.google") },
                { text: t("help.agenda.colors") },
              ]}
            />
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={goPrev}
                className="rounded p-1.5 text-zinc-500 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800 transition-colors"
                aria-label={t("a11y.previousWeek")}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={goToday}
                className="rounded px-3 py-1 text-sm font-medium text-zinc-700 dark:text-slate-300 border border-zinc-200 dark:border-slate-600 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
              >
                {t("agenda.today")}
              </button>
              <button
                type="button"
                onClick={goNext}
                className="rounded p-1.5 text-zinc-500 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800 transition-colors"
                aria-label={t("a11y.nextWeek")}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            <span className="text-sm text-zinc-500 dark:text-slate-400 hidden sm:inline">{headerLabel}</span>
          </div>

          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            <div className="inline-flex rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-0.5">
              {(["day", "week", "month"] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    viewMode === mode
                      ? "bg-slate-700 dark:bg-slate-600 text-white"
                      : "text-zinc-500 dark:text-slate-400 hover:text-zinc-700 dark:hover:text-slate-200"
                  }`}
                >
                  {t(`agenda.view${mode.charAt(0).toUpperCase() + mode.slice(1)}`)}
                </button>
              ))}
            </div>
            {/* Calendar picker dropdown */}
            <div className="relative" ref={calendarMenuRef}>
              <button
                type="button"
                onClick={() => setCalendarMenuOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {t("agenda.calendars")}
                {linkedCalendarCount > 0 && (
                  <span className="ml-0.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold rounded-full min-w-[1rem] h-4 px-0.5 flex items-center justify-center">
                    {linkedCalendarCount - hiddenAccounts.size}
                  </span>
                )}
                <svg className={`w-3 h-3 transition-transform ${calendarMenuOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {calendarMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-72 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-zinc-200 dark:border-slate-700 z-50 overflow-hidden">
                  {linkedCalendarCount > 0 ? (
                    <div className="max-h-64 overflow-y-auto py-1">
                      {googleAccounts.length > 0 && (
                        <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-slate-500">
                          {t("agenda.sectionGoogle")}
                        </div>
                      )}
                      {googleAccounts.map((acc) => {
                        const color = accountColorMap.get(acc.email) ?? ACCOUNT_COLORS[0];
                        const visible = !hiddenAccounts.has(acc.email);
                        return (
                          <label
                            key={`g-${acc.id}`}
                            className="flex items-center gap-2.5 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={visible}
                              onChange={() => toggleAccountVisibility(acc.email)}
                              className="w-3.5 h-3.5 rounded border-zinc-300 dark:border-slate-600 text-emerald-600 focus:ring-emerald-500"
                            />
                            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                            <span className="text-xs text-zinc-700 dark:text-slate-200 flex-1 truncate font-medium">{acc.email}</span>
                          </label>
                        );
                      })}
                      {microsoftAccounts.length > 0 && (
                        <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-slate-500 border-t border-zinc-100 dark:border-slate-700/80 mt-1">
                          {t("agenda.sectionOutlook")}
                        </div>
                      )}
                      {microsoftAccounts.map((acc) => {
                        const color = accountColorMap.get(acc.email) ?? ACCOUNT_COLORS[0];
                        const visible = !hiddenAccounts.has(acc.email);
                        return (
                          <label
                            key={`m-${acc.id}`}
                            className="flex items-center gap-2.5 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={visible}
                              onChange={() => toggleAccountVisibility(acc.email)}
                              className="w-3.5 h-3.5 rounded border-zinc-300 dark:border-slate-600 text-emerald-600 focus:ring-emerald-500"
                            />
                            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                            <span className="text-xs text-zinc-700 dark:text-slate-200 flex-1 truncate font-medium">{acc.email}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-3 py-3 text-center space-y-1">
                      <p className="text-xs text-zinc-400 dark:text-slate-500">{t("settings.noGoogleAccounts")}</p>
                      <p className="text-xs text-zinc-400 dark:text-slate-500">{t("settings.noMicrosoftAccounts")}</p>
                    </div>
                  )}
                  <div className="border-t border-zinc-100 dark:border-slate-700 px-3 py-2">
                    <Link
                      href="/agenda/manage"
                      onClick={() => setCalendarMenuOpen(false)}
                      className="block w-full text-center text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                    >
                      {t("agenda.manageCalendars")}
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {pendingSyncCount > 0 && canSyncExternalSlots && (
          <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-800/50 dark:bg-amber-950/25 dark:text-amber-100">
            <p className="text-sm font-medium">
              {t("agenda.inAppSlotsSyncBanner").replace("{{count}}", String(pendingSyncCount))}
            </p>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={syncBannerRunning}
                onClick={() => void handleBannerSync()}
                className="rounded-lg bg-slate-800 dark:bg-slate-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 dark:hover:bg-slate-500 disabled:opacity-50 transition-colors"
              >
                {syncBannerRunning ? "…" : t("agenda.inAppSlotsSyncBannerSync")}
              </button>
              <button
                type="button"
                onClick={() => router.push("/agenda/manage")}
                className="rounded-lg border border-amber-300 dark:border-amber-700/60 bg-white/80 dark:bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-amber-900 dark:text-amber-100 hover:bg-amber-100/80 dark:hover:bg-slate-800 transition-colors"
              >
                {t("agenda.inAppSlotsSyncBannerManage")}
              </button>
            </div>
          </div>
        )}

        {/* Loading overlay */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Calendar grid — Day / Week */}
        {!loading && viewMode !== "month" && (
          <div className="flex-1 overflow-hidden rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <div className="flex flex-col h-full">
              {/* Day headers (sticky) */}
              <div
                className="flex border-b border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 sticky top-0 z-20"
                style={{ paddingRight: timeGridScrollbarW }}
              >
                <div className="w-14 shrink-0 border-r border-zinc-100 dark:border-slate-800" />
                {visibleDays.map((day, i) => {
                  const isToday = isSameDay(day, today);
                  const dayFmt = new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-US", { weekday: "short" });
                  return (
                    <div
                      key={i}
                      className={`flex-1 min-w-[100px] text-center py-2 border-r border-zinc-100 dark:border-slate-800 last:border-r-0 ${
                        isToday ? "bg-blue-50/50 dark:bg-blue-950/20" : ""
                      }`}
                    >
                      <div className="text-[11px] uppercase tracking-wide text-zinc-400 dark:text-slate-500 font-medium">
                        {dayFmt.format(day)}
                      </div>
                      <div
                        className={`text-sm font-semibold mt-0.5 ${
                          isToday
                            ? "w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center mx-auto"
                            : "text-zinc-700 dark:text-slate-300"
                        }`}
                      >
                        {day.getDate()}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* All-day events row */}
              {visibleDays.some((d) => eventsForDay(d, true).length > 0) && (
                <div
                  className="flex border-b border-zinc-200 dark:border-slate-700 bg-zinc-50/50 dark:bg-slate-800/30"
                  style={{ paddingRight: timeGridScrollbarW }}
                >
                  <div className="w-14 shrink-0 border-r border-zinc-100 dark:border-slate-800 flex items-center justify-center">
                    <span className="text-[10px] text-zinc-400 dark:text-slate-500">{t("agenda.allDay")}</span>
                  </div>
                  {visibleDays.map((day, i) => {
                    const dayAllDay = eventsForDay(day, true);
                    return (
                      <div key={i} className="flex-1 min-w-[100px] p-1 border-r border-zinc-100 dark:border-slate-800 last:border-r-0 space-y-0.5">
                        {dayAllDay.map((ev) => {
                          const isWroket = ev.source === "wroket";
                          const qc = isWroket ? QUADRANT_COLORS[classifyEvent(ev)] : null;
                          const acctColor = !isWroket ? getAccountColor(ev.accountEmail) : "";
                          return (
                            <div
                              key={`${ev.id}-${day.toDateString()}`}
                              className={`rounded px-1.5 py-0.5 text-[11px] border-l-2 ${
                                isWroket && qc
                                  ? `${qc.bg} ${qc.border} ${qc.text} cursor-pointer`
                                  : "text-zinc-800 dark:text-slate-200"
                              }`}
                              style={!isWroket ? { borderLeftColor: acctColor, backgroundColor: hexToTintBg(acctColor, 0.18) } : undefined}
                              onClick={
                                isWroket
                                  ? () => { void openWroketTaskFromCalendarEvent(ev); }
                                  : undefined
                              }
                              title={isWroket ? `${ev.summary}\n${t("agenda.bookedFromWroket")}` : undefined}
                            >
                              <div className="truncate leading-tight">
                                {ev.delegated ? "← " : ""}{isWroket && qc ? `${qc.icon} ` : ""}{ev.recurring ? "↻ " : ""}{ev.summary}
                              </div>
                              {isWroket && (
                                <div className="text-[9px] opacity-80 truncate leading-tight mt-0.5">{t("agenda.bookedFromWroket")}</div>
                              )}
                              {isWroket && ev.meetingUrl && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.open(ev.meetingUrl!, "_blank", "noopener");
                                  }}
                                  className="mt-0.5 text-[9px] underline underline-offset-2 opacity-90 hover:opacity-100"
                                  title={t(meetingJoinI18nKey(ev.meetingProvider))}
                                >
                                  {t(meetingJoinI18nKey(ev.meetingProvider))}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Time grid (scrollable) */}
              <div ref={timeGridScrollRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-auto">
                <div className="flex" style={{ minHeight: TOTAL_HOURS * HOUR_HEIGHT }}>
                  {/* Time labels column */}
                  <div className="w-14 shrink-0 relative border-r border-zinc-100 dark:border-slate-800">
                    {hours.map((h) => (
                      <div
                        key={h}
                        className="absolute w-full text-right pr-2"
                        style={{ top: (h - DAY_START_HOUR) * HOUR_HEIGHT - 6 }}
                      >
                        <span className="text-[11px] text-zinc-400 dark:text-slate-500">{formatHour(h)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Day columns */}
                  {visibleDays.map((day, dayIdx) => {
                    const isToday = isSameDay(day, today);
                    const dayEvents = eventsForDay(day, false);
                    return (
                      <div
                        key={dayIdx}
                        data-agenda-day={`${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`}
                        className={`flex-1 min-w-[100px] relative border-r border-zinc-100 dark:border-slate-800 last:border-r-0 ${
                          isToday ? "bg-blue-50/30 dark:bg-blue-950/20" : ""
                        }`}
                        onDoubleClick={(e) => handleSlotClick(day, e)}
                      >
                        {/* Hour grid lines */}
                        {hours.map((h) => (
                          <div
                            key={h}
                            className="absolute w-full border-b border-zinc-100 dark:border-slate-800/60"
                            style={{ top: (h - DAY_START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT - 1, height: 1 }}
                          />
                        ))}

                        {/* Events */}
                        {dayEvents.map((ev) => {
                          const pos = getEventPositionForDay(ev, day);
                          const isWroket = ev.source === "wroket";
                          const qc = isWroket ? QUADRANT_COLORS[classifyEvent(ev)] : null;
                          const acctColor = !isWroket ? getAccountColor(ev.accountEmail) : "";
                          const externalTitle = !isWroket ? externalEventTitle(ev) : undefined;
                          const wroketDragEnabled = isWroket && !ev.allDay && !ev.recurring;
                          const wroketTimedId =
                            wroketDragEnabled ? (ev.id.includes("_rec_") ? ev.id.split("_rec_")[0]! : ev.id) : null;
                          const isBookingThis = wroketTimedId !== null && bookingMoveId === wroketTimedId;
                          return (
                            <div
                              key={`${ev.id}-${day.toDateString()}`}
                              className={`absolute left-1 right-1 rounded px-1.5 py-0.5 overflow-hidden transition-shadow hover:shadow-lg hover:z-30 z-10 border-l-[3px] shadow-sm select-none ${
                                isWroket && qc
                                  ? `${qc.bg} ${qc.border} ${qc.text} ${wroketDragEnabled ? "cursor-grab active:cursor-grabbing touch-none" : "cursor-pointer"}`
                                  : "text-zinc-800 dark:text-slate-200 cursor-default"
                              }`}
                              style={{
                                top: pos.top,
                                height: pos.height,
                                minHeight: 22,
                                opacity: isBookingThis ? 0.55 : undefined,
                                ...(!isWroket ? {
                                  borderLeftColor: acctColor,
                                  backgroundColor: hexToTintBg(acctColor, 0.18),
                                } : {}),
                              }}
                              title={
                                isWroket && qc
                                  ? `${ev.summary} — ${qc.icon} ${qc.label}\n${t("agenda.bookedFromWroket")}`
                                  : externalTitle
                              }
                              onPointerDown={wroketDragEnabled ? (e) => beginWroketDrag(ev, e) : undefined}
                              onPointerMove={wroketDragEnabled ? moveWroketDrag : undefined}
                              onPointerUp={wroketDragEnabled ? endWroketDrag : undefined}
                              onPointerCancel={wroketDragEnabled ? endWroketDrag : undefined}
                              onClick={
                                isWroket
                                  ? (e) => {
                                      if (suppressNextWroketClickRef.current) {
                                        suppressNextWroketClickRef.current = false;
                                        e.preventDefault();
                                        e.stopPropagation();
                                        return;
                                      }
                                      e.stopPropagation();
                                      void openWroketTaskFromCalendarEvent(ev);
                                    }
                                  : undefined
                              }
                            >
                              <div className="text-xs font-semibold truncate leading-snug">
                                {ev.delegated ? "← " : ""}{isWroket && qc ? `${qc.icon} ` : ""}{ev.recurring ? "↻ " : ""}{ev.summary}
                              </div>
                              {isWroket && (
                                <div className="text-[9px] opacity-85 truncate leading-tight mt-0.5">{t("agenda.bookedFromWroket")}</div>
                              )}
                              {isWroket && ev.meetingUrl && (
                                <button
                                  type="button"
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.open(ev.meetingUrl!, "_blank", "noopener");
                                  }}
                                  className="text-[9px] underline underline-offset-2 opacity-90 hover:opacity-100 mt-0.5"
                                  title={t(meetingJoinI18nKey(ev.meetingProvider))}
                                >
                                  {t(meetingJoinI18nKey(ev.meetingProvider))}
                                </button>
                              )}
                              {pos.height >= 44 && (
                                <div className="text-[10px] opacity-80 mt-0.5 font-medium">
                                  {new Date(ev.start).toLocaleTimeString(locale === "fr" ? "fr-FR" : "en-US", { hour: "2-digit", minute: "2-digit" })}
                                  {" – "}
                                  {new Date(ev.end).toLocaleTimeString(locale === "fr" ? "fr-FR" : "en-US", { hour: "2-digit", minute: "2-digit" })}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* Current time line */}
                        {isToday && now.getHours() >= DAY_START_HOUR && now.getHours() < DAY_END_HOUR && (
                          <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: currentTimeTop }}>
                            <div className="flex items-center">
                              <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1 shrink-0" />
                              <div className="flex-1 h-[2px] bg-red-500" />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Calendar grid — Month */}
        {!loading && viewMode === "month" && (() => {
          const monthLocale = locale === "fr" ? "fr-FR" : "en-US";
          const monthDayNames = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(2024, 0, i + 1);
            return new Intl.DateTimeFormat(monthLocale, { weekday: "short" }).format(d);
          });
          const currentMonth = currentDate.getMonth();
          return (
            <div className="flex-1 overflow-hidden rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900">
              <div className="grid grid-cols-7 border-b border-zinc-200 dark:border-slate-700">
                {monthDayNames.map((name) => (
                  <div key={name} className="text-center py-2 text-[11px] uppercase tracking-wide text-zinc-400 dark:text-slate-500 font-medium border-r border-zinc-100 dark:border-slate-800 last:border-r-0">
                    {name}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 grid-rows-6 flex-1" style={{ minHeight: "calc(100% - 36px)" }}>
                {monthDays.map((day, i) => {
                  const isCurrentMonth = day.getMonth() === currentMonth;
                  const isToday = isSameDay(day, today);
                  const dayEvts = allEvents.filter((e) => eventVisibleOnCalendarDay(e, day));
                  return (
                    <div
                      key={i}
                      className={`border-r border-b border-zinc-100 dark:border-slate-800 last:border-r-0 p-1 min-h-[80px] cursor-pointer hover:bg-zinc-50 dark:hover:bg-slate-800/50 transition-colors ${
                        !isCurrentMonth ? "opacity-40" : ""
                      } ${isToday ? "bg-blue-50/50 dark:bg-blue-950/20" : ""}`}
                      onDoubleClick={() => handleDoubleClickSlot(day, 9, 0)}
                    >
                      <div className={`text-xs font-semibold mb-0.5 ${
                        isToday
                          ? "w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center"
                          : "text-zinc-700 dark:text-slate-300 pl-1"
                      }`}>
                        {day.getDate()}
                      </div>
                      <div className="space-y-0.5">
                        {dayEvts.slice(0, 3).map((ev) => {
                          const isWroket = ev.source === "wroket";
                          const qc = isWroket ? QUADRANT_COLORS[classifyEvent(ev)] : null;
                          const acctColor = !isWroket ? getAccountColor(ev.accountEmail) : "";
                          return (
                            <div
                              key={ev.id}
                              className={`rounded px-1 py-0.5 text-[10px] truncate border-l-2 ${
                                isWroket && qc
                                  ? `${qc.bg} ${qc.border} ${qc.text}`
                                  : "text-zinc-700 dark:text-slate-300"
                              }`}
                              style={!isWroket ? { borderLeftColor: acctColor, backgroundColor: hexToTintBg(acctColor, 0.18) } : undefined}
                              onClick={
                                isWroket
                                  ? (e) => {
                                      e.stopPropagation();
                                      void openWroketTaskFromCalendarEvent(ev);
                                    }
                                  : undefined
                              }
                              title={isWroket ? `${ev.summary}\n${t("agenda.bookedFromWroket")}` : ev.summary}
                            >
                              <span className="block truncate">{ev.delegated ? "← " : ""}{ev.recurring ? "↻ " : ""}{ev.summary}</span>
                              {isWroket && (
                                <span className="block text-[8px] opacity-75 truncate leading-tight">{t("agenda.bookedFromWroket")}</span>
                              )}
                              {isWroket && ev.meetingUrl && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.open(ev.meetingUrl!, "_blank", "noopener");
                                  }}
                                  className="block text-[8px] underline underline-offset-2 opacity-90 hover:opacity-100"
                                  title={t(meetingJoinI18nKey(ev.meetingProvider))}
                                >
                                  {t(meetingJoinI18nKey(ev.meetingProvider))}
                                </button>
                              )}
                            </div>
                          );
                        })}
                        {dayEvts.length > 3 && (
                          <div className="text-[9px] text-zinc-400 dark:text-slate-500 font-medium pl-1">
                            +{dayEvts.length - 3}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Empty state */}
        {!loading && allEvents.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <svg className="w-12 h-12 mx-auto text-zinc-300 dark:text-slate-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm text-zinc-400 dark:text-slate-500">{t("agenda.noEvents")}</p>
            </div>
          </div>
        )}

        {/* Quick-create task modal */}
        {showQuickCreate && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowQuickCreate(false)}>
            <div className="bg-white dark:bg-slate-900 rounded-lg shadow-2xl border border-zinc-200 dark:border-slate-700 w-full max-w-sm mx-4 p-5" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-slate-100 mb-1">{t("agenda.newTask")}</h3>
              <p className="text-xs text-zinc-400 dark:text-slate-500 mb-4">
                {quickCreateDate}
              </p>
              <div className="space-y-3">
                <input
                  value={quickCreateTitle}
                  onChange={(e) => setQuickCreateTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleQuickCreate(); if (e.key === "Escape") setShowQuickCreate(false); }}
                  placeholder={t("todos.addPlaceholder")}
                  autoFocus
                  className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400"
                />
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("agenda.startTime")}</label>
                    <input
                      type="time"
                      value={quickCreateTime}
                      onChange={(e) => setQuickCreateTime(e.target.value)}
                      className="w-full rounded border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-sm dark:bg-slate-800 dark:text-slate-100 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("agenda.duration")}</label>
                    <input
                      type="number"
                      min={5}
                      max={480}
                      step={5}
                      value={quickCreateDuration}
                      onChange={(e) => setQuickCreateDuration(Math.max(5, Math.min(480, Number(e.target.value) || 5)))}
                      className="w-full rounded border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-sm dark:bg-slate-800 dark:text-slate-100 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400 text-center"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <select value={quickCreatePriority} onChange={(e) => setQuickCreatePriority(e.target.value as Priority)} className="flex-1 rounded border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-sm dark:bg-slate-800 dark:text-slate-100">
                    <option value="high">{t("priority.high")}</option>
                    <option value="medium">{t("priority.medium")}</option>
                    <option value="low">{t("priority.low")}</option>
                  </select>
                  <select
                    value={quickCreateEffort}
                    onChange={(e) => {
                      const effort = e.target.value as Effort;
                      setQuickCreateEffort(effort);
                      setQuickCreateDuration(getEffortDuration(effort));
                    }}
                    className="flex-1 rounded border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-sm dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="light">{t("effort.light")}</option>
                    <option value="medium">{t("effort.medium")}</option>
                    <option value="heavy">{t("effort.heavy")}</option>
                  </select>
                </div>
                {sortedProjectOptions.length > 0 && (
                  <select
                    value={quickCreateProjectId ?? ""}
                    onChange={(e) => setQuickCreateProjectId(e.target.value || null)}
                    className="w-full rounded border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-sm dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="">{t("projects.noProject")}</option>
                    {sortedProjectOptions.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                )}
                <div>
                  <ContactEmailSuggestInput
                    value={quickCreateAssignEmail}
                    onChange={handleQuickAssignLookup}
                    placeholder={t("assign.placeholder")}
                    inputClassName={`w-full rounded border px-3 py-1.5 text-sm dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 ${
                      quickCreateAssignedUser
                        ? "border-green-400 dark:border-green-600 focus:border-green-500 focus:ring-green-500"
                        : quickCreateAssignError
                          ? "border-red-400 dark:border-red-600 focus:border-red-500 focus:ring-red-500"
                          : "border-zinc-300 dark:border-slate-600 focus:border-slate-700 dark:focus:border-slate-400 focus:ring-slate-700 dark:focus:ring-slate-400"
                    }`}
                    rightAdornment={
                      quickCreateAssignedUser ? (
                        <span className="text-green-500">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                      ) : undefined
                    }
                  />
                  {quickCreateAssignError && (
                    <p className="text-xs text-red-500 mt-0.5">{quickCreateAssignError}</p>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setShowQuickCreate(false)} className="rounded border border-zinc-300 dark:border-slate-600 px-3 py-1.5 text-sm font-medium text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors">{t("cancel")}</button>
                <button onClick={handleQuickCreate} disabled={!quickCreateTitle.trim() || quickCreating || personalTaskCreateBlocked(user, quickCreateProjectId, projects)} className="rounded bg-slate-700 dark:bg-slate-600 px-4 py-1.5 text-sm font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-60 transition-colors">{t("settings.save")}</button>
              </div>
            </div>
          </div>
        )}

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
          onAssignLookup={() => {}}
          onClearAssign={() => setEditForm((f) => ({ ...f, assignedTo: null }))}
          userDisplayName={displayName}
          projects={projects}
          effortDefaults={user?.effortMinutes}
          currentUserUid={user?.uid}
          isTaskOwner={!editingTodo || editingTodo.userId === user?.uid}
          onPersistTags={persistEditTags}
          freeTierContentLocks={
            !!user && !!editingTodo && editingTodo.userId === user.uid && user.billingPlan === "free" && !user.earlyBird
          }
          canSyncToCalendar={canSyncExternalSlots && !!editingTodo && editingTodo.userId === user?.uid}
          onExternalSlotSynced={handleExternalSlotSynced}
          onRequestDeleteTask={async (td) => {
            await closeEditModal();
            try {
              const [owned, assigned] = await Promise.all([getTodos(), getAssignedTodos()]);
              const subtaskCount = [...owned, ...assigned].filter((x) => x.parentId === td.id).length;
              setDeleteTaskDialog({ todo: td, subtaskCount });
            } catch {
              setDeleteTaskDialog({ todo: td, subtaskCount: 0 });
            }
          }}
        />

        {dragConflict && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="agenda-drag-conflict-title"
          >
            <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-4 shadow-xl dark:border-slate-600 dark:bg-slate-900">
              <h2 id="agenda-drag-conflict-title" className="text-sm font-semibold text-zinc-900 dark:text-slate-100">
                {t("schedule.conflictTitle")}
              </h2>
              <ul className="mt-2 max-h-40 overflow-y-auto text-xs text-zinc-600 dark:text-slate-300 space-y-1">
                {dragConflict.conflicts.map((c) => (
                  <li key={c.id} className="truncate">
                    {c.title}
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-slate-600"
                  onClick={() => setDragConflict(null)}
                >
                  {t("schedule.conflictCancel")}
                </button>
                <button
                  type="button"
                  className="rounded-md bg-slate-800 px-3 py-1.5 text-sm text-white dark:bg-slate-600"
                  onClick={() => {
                    const d = dragConflict;
                    if (!d) return;
                    setDragConflict(null);
                    void commitSlotMove(d.todoId, d.start, d.end, true);
                  }}
                >
                  {t("schedule.conflictForce")}
                </button>
              </div>
            </div>
          </div>
        )}

        <DeleteTaskDialog
          open={!!deleteTaskDialog}
          taskTitle={deleteTaskDialog?.todo.title ?? ""}
          subtaskCount={deleteTaskDialog?.subtaskCount ?? 0}
          onCancel={() => setDeleteTaskDialog(null)}
          onDeleteAndPromote={() => void executeAgendaDeleteTask("promote")}
          onDeleteAll={() => void executeAgendaDeleteTask("deleteAll")}
        />
      </div>
    </AppShell>
  );
}
