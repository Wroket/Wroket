"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthContext";
import PageHelpButton from "@/components/PageHelpButton";
import TaskEditModal from "@/components/TaskEditModal";
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
  bookTaskSlot,
  lookupUser,
  type CalendarEvent,
  type Todo,
  type Project,
  type Priority,
  type Effort,
  type AuthMeResponse,
  type Recurrence,
  type GoogleAccountPublic,
} from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import { useUserLookup } from "@/lib/userUtils";
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

export default function AgendaPage() {
  const { t, locale } = useLocale();
  const { user } = useAuth();
  const { toast } = useToast();
  const { resolveUser, displayName, cache: userCache } = useUserLookup();
  type ViewMode = "day" | "week" | "month";
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [wroketEvents, setWroketEvents] = useState<CalendarEvent[]>([]);
  const [googleEvents, setGoogleEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [googleAccounts, setGoogleAccounts] = useState<GoogleAccountPublic[]>([]);
  const [hiddenAccounts, setHiddenAccounts] = useState<Set<string>>(new Set());
  const [calendarMenuOpen, setCalendarMenuOpen] = useState(false);
  const calendarMenuRef = useRef<HTMLDivElement>(null);
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
  const [editForm, setEditForm] = useState({ title: "", priority: "medium" as Priority, effort: "medium" as Effort, startDate: "", deadline: "", assignedTo: "" as string | null, estimatedMinutes: null as number | null, tags: [] as string[], recurrence: null as Recurrence | null, projectId: null as string | null });
  const [editAssignEmail, setEditAssignEmail] = useState("");
  const [editAssignedUser, setEditAssignedUser] = useState<AuthMeResponse | null>(null);
  const [editAssignError, setEditAssignError] = useState<string | null>(null);
  const editAssignLookupTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const accountColorMap = useMemo(() => {
    const map = new Map<string, string>();
    googleAccounts.forEach((acc, i) => {
      map.set(acc.email, ACCOUNT_COLORS[i % ACCOUNT_COLORS.length]);
    });
    return map;
  }, [googleAccounts]);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [me, projs] = await Promise.all([getMe(), getProjects()]);
        if (!cancelled) {
          setGoogleAccounts(me.googleAccounts ?? []);
          setProjects(projs.filter((p) => p.status === "active"));
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

  const allEvents = useMemo(() => [...wroketEvents, ...visibleGoogleEvents], [wroketEvents, visibleGoogleEvents]);

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

  const getAccountColor = (accountEmail?: string): string => {
    if (!accountEmail) return ACCOUNT_COLORS[0];
    return accountColorMap.get(accountEmail) ?? ACCOUNT_COLORS[0];
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
      const data = await getCalendarEvents(dateRange.start, dateRange.end);
      setWroketEvents(data.wroketEvents);
      setGoogleEvents(data.googleEvents);
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

  const handleDoubleClickEvent = async (ev: CalendarEvent) => {
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
      if (todo.assignedTo && !userCache[todo.assignedTo]) {
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
  }, [dateRange]);

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
                {googleAccounts.length > 0 && (
                  <span className="ml-0.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {googleAccounts.length - hiddenAccounts.size}
                  </span>
                )}
                <svg className={`w-3 h-3 transition-transform ${calendarMenuOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {calendarMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-72 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-zinc-200 dark:border-slate-700 z-50 overflow-hidden">
                  {googleAccounts.length > 0 ? (
                    <div className="max-h-64 overflow-y-auto py-1">
                      {googleAccounts.map((acc) => {
                        const color = accountColorMap.get(acc.email) ?? ACCOUNT_COLORS[0];
                        const visible = !hiddenAccounts.has(acc.email);
                        return (
                          <label
                            key={acc.id}
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
                    <div className="px-3 py-3 text-center">
                      <p className="text-xs text-zinc-400 dark:text-slate-500">{t("settings.noGoogleAccounts")}</p>
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
              <div className="flex border-b border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 sticky top-0 z-20">
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
                <div className="flex border-b border-zinc-200 dark:border-slate-700 bg-zinc-50/50 dark:bg-slate-800/30">
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
                              onDoubleClick={() => handleDoubleClickEvent(ev)}
                              title={isWroket ? `${ev.summary}\n${t("agenda.bookedFromWroket")}` : undefined}
                            >
                              <div className="truncate leading-tight">
                                {ev.delegated ? "← " : ""}{isWroket && qc ? `${qc.icon} ` : ""}{ev.recurring ? "↻ " : ""}{ev.summary}
                              </div>
                              {isWroket && (
                                <div className="text-[9px] opacity-80 truncate leading-tight mt-0.5">{t("agenda.bookedFromWroket")}</div>
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
              <div className="flex-1 overflow-y-auto overflow-x-auto">
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
                          const googleTitle = !isWroket
                            ? `${ev.summary} (${ev.accountEmail ?? t("agenda.googleEvent")})`
                            : undefined;
                          return (
                            <div
                              key={`${ev.id}-${day.toDateString()}`}
                              className={`absolute left-1 right-1 rounded px-1.5 py-0.5 overflow-hidden transition-shadow hover:shadow-lg hover:z-30 z-10 border-l-[3px] shadow-sm ${
                                isWroket && qc
                                  ? `${qc.bg} ${qc.border} ${qc.text} cursor-pointer`
                                  : "text-zinc-800 dark:text-slate-200 cursor-default"
                              }`}
                              style={{
                                top: pos.top,
                                height: pos.height,
                                minHeight: 22,
                                ...(!isWroket ? {
                                  borderLeftColor: acctColor,
                                  backgroundColor: hexToTintBg(acctColor, 0.18),
                                } : {}),
                              }}
                              title={
                                isWroket && qc
                                  ? `${ev.summary} — ${qc.icon} ${qc.label}\n${t("agenda.bookedFromWroket")}`
                                  : googleTitle
                              }
                              onDoubleClick={(e) => { e.stopPropagation(); handleDoubleClickEvent(ev); }}
                            >
                              <div className="text-xs font-semibold truncate leading-snug">
                                {ev.delegated ? "← " : ""}{isWroket && qc ? `${qc.icon} ` : ""}{ev.recurring ? "↻ " : ""}{ev.summary}
                              </div>
                              {isWroket && (
                                <div className="text-[9px] opacity-85 truncate leading-tight mt-0.5">{t("agenda.bookedFromWroket")}</div>
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
                              onDoubleClick={(e) => { e.stopPropagation(); handleDoubleClickEvent(ev); }}
                              title={isWroket ? `${ev.summary}\n${t("agenda.bookedFromWroket")}` : ev.summary}
                            >
                              <span className="block truncate">{ev.delegated ? "← " : ""}{ev.recurring ? "↻ " : ""}{ev.summary}</span>
                              {isWroket && (
                                <span className="block text-[8px] opacity-75 truncate leading-tight">{t("agenda.bookedFromWroket")}</span>
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
                <button onClick={handleQuickCreate} disabled={!quickCreateTitle.trim() || quickCreating} className="rounded bg-slate-700 dark:bg-slate-600 px-4 py-1.5 text-sm font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-60 transition-colors">{t("settings.save")}</button>
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
          effortDefaults={user?.effortMinutes}
          currentUserUid={user?.uid}
          onPersistTags={persistEditTags}
        />
      </div>
    </AppShell>
  );
}
