"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthContext";
import PageHelpButton from "@/components/PageHelpButton";
import TaskEditModal from "@/components/TaskEditModal";
import { useToast } from "@/components/Toast";
import {
  getCalendarEvents,
  getMe,
  getTodos,
  updateTodo,
  lookupUser,
  type CalendarEvent,
  type Todo,
  type Priority,
  type Effort,
  type AuthMeResponse,
  type Recurrence,
  type GoogleAccountPublic,
} from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import type { TranslationKey } from "@/lib/i18n";
import { useUserLookup } from "@/lib/userUtils";
import { classify, type EisenhowerQuadrant } from "@/lib/classify";

const HOUR_HEIGHT = 60;
const DAY_START_HOUR = 6;
const DAY_END_HOUR = 22;
const TOTAL_HOURS = DAY_END_HOUR - DAY_START_HOUR;

const ACCOUNT_COLORS = [
  "#10b981", // emerald
  "#8b5cf6", // violet
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
  "#6366f1", // indigo
];

const QUADRANT_COLORS: Record<EisenhowerQuadrant, { bg: string; border: string; text: string; icon: string; label: string }> = {
  "do-first": { bg: "bg-red-100 dark:bg-red-900/40", border: "border-red-500", text: "text-red-800 dark:text-red-200", icon: "🔥", label: "Faire" },
  "schedule":  { bg: "bg-blue-100 dark:bg-blue-900/40", border: "border-blue-500", text: "text-blue-800 dark:text-blue-200", icon: "📅", label: "Planifier" },
  "delegate":  { bg: "bg-amber-100 dark:bg-amber-900/40", border: "border-amber-500", text: "text-amber-800 dark:text-amber-200", icon: "⚡", label: "Expédier" },
  "eliminate":  { bg: "bg-zinc-100 dark:bg-slate-700/40", border: "border-zinc-400", text: "text-zinc-700 dark:text-zinc-300", icon: "⏸️", label: "Différer" },
};

function classifyEvent(ev: CalendarEvent): EisenhowerQuadrant {
  const pseudo = {
    priority: (ev.priority ?? "medium") as Todo["priority"],
    effort: (ev.effort ?? "medium") as Todo["effort"],
    deadline: ev.deadline ?? null,
  } as Todo;
  return classify(pseudo);
}

function getEventPosition(event: CalendarEvent) {
  const start = new Date(event.start);
  const end = new Date(event.end);
  const topMinutes = (start.getHours() - DAY_START_HOUR) * 60 + start.getMinutes();
  const durationMinutes = (end.getTime() - start.getTime()) / 60000;
  return {
    top: (topMinutes / 60) * HOUR_HEIGHT,
    height: Math.max((durationMinutes / 60) * HOUR_HEIGHT, 20),
  };
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatHour(h: number): string {
  return `${h.toString().padStart(2, "0")}:00`;
}

function hexToTintBg(hex: string, opacity = 0.15): string {
  const clean = hex.replace("#", "");
  if (clean.length < 6) return `rgba(16,185,129,${opacity})`;
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

export default function AgendaPage() {
  const { t, locale } = useLocale();
  const { user } = useAuth();
  const { toast } = useToast();
  const { resolveUser, displayName, cache: userCache } = useUserLookup();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [wroketEvents, setWroketEvents] = useState<CalendarEvent[]>([]);
  const [googleEvents, setGoogleEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [googleAccounts, setGoogleAccounts] = useState<GoogleAccountPublic[]>([]);
  const [hiddenAccounts, setHiddenAccounts] = useState<Set<string>>(new Set());
  const [calendarMenuOpen, setCalendarMenuOpen] = useState(false);
  const calendarMenuRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(new Date());

  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [editForm, setEditForm] = useState({ title: "", priority: "medium" as Priority, effort: "medium" as Effort, deadline: "", assignedTo: "" as string | null, estimatedMinutes: null as number | null, tags: [] as string[], recurrence: null as Recurrence | null });
  const [editAssignEmail, setEditAssignEmail] = useState("");
  const [editAssignedUser, setEditAssignedUser] = useState<AuthMeResponse | null>(null);
  const [editAssignError, setEditAssignError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const editAssignLookupTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const accountColorMap = useMemo(() => {
    const map = new Map<string, string>();
    googleAccounts.forEach((acc, i) => {
      map.set(acc.email, ACCOUNT_COLORS[i % ACCOUNT_COLORS.length]);
    });
    return map;
  }, [googleAccounts]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await getMe();
        if (!cancelled) setGoogleAccounts(me.googleAccounts ?? []);
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const start = weekDays[0].toISOString();
        const endDate = new Date(weekDays[6]);
        endDate.setHours(23, 59, 59, 999);
        const end = endDate.toISOString();
        const data = await getCalendarEvents(start, end);
        if (!cancelled) {
          setWroketEvents(data.wroketEvents);
          setGoogleEvents(data.googleEvents);
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [weekDays]);

  const goToday = useCallback(() => setCurrentDate(new Date()), []);
  const goPrev = useCallback(() => setCurrentDate((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; }), []);
  const goNext = useCallback(() => setCurrentDate((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; }), []);

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
      allEvents.filter((e) => {
        const eStart = new Date(e.start);
        return isSameDay(eStart, day) && e.allDay === allDay;
      }),
    [allEvents],
  );

  const weekLabel = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-US", { day: "numeric", month: "long", year: "numeric" });
    fmt.format(weekDays[0]);
    const startDay = weekDays[0].getDate();
    const endParts = fmt.formatToParts(weekDays[6]);
    const endDay = endParts.find((p) => p.type === "day")?.value ?? "";
    const endMonth = endParts.find((p) => p.type === "month")?.value ?? "";
    const endYear = endParts.find((p) => p.type === "year")?.value ?? "";
    if (weekDays[0].getMonth() === weekDays[6].getMonth()) {
      return `${startDay} - ${endDay} ${endMonth} ${endYear}`;
    }
    const s = fmt.format(weekDays[0]);
    const e = fmt.format(weekDays[6]);
    return `${s} - ${e}`;
  }, [weekDays, locale]);

  const dayNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-US", { weekday: "short" });
    return weekDays.map((d) => fmt.format(d));
  }, [weekDays, locale]);

  const today = new Date();

  const currentTimeTop = useMemo(() => {
    const mins = (now.getHours() - DAY_START_HOUR) * 60 + now.getMinutes();
    return (mins / 60) * HOUR_HEIGHT;
  }, [now]);

  const hasAllDayEvents = useMemo(() => weekDays.some((d) => eventsForDay(d, true).length > 0), [weekDays, eventsForDay]);

  const hours = useMemo(() => Array.from({ length: TOTAL_HOURS }, (_, i) => DAY_START_HOUR + i), []);

  const getAccountColor = (accountEmail?: string): string => {
    if (!accountEmail) return ACCOUNT_COLORS[0];
    return accountColorMap.get(accountEmail) ?? ACCOUNT_COLORS[0];
  };

  // ── Task editing ──

  const handleDoubleClickEvent = async (ev: CalendarEvent) => {
    if (ev.source !== "wroket") return;
    try {
      const todos = await getTodos();
      const todo = todos.find((t) => t.id === ev.id);
      if (!todo) { toast.error("Tâche introuvable"); return; }
      setEditingTodo(todo);
      setEditForm({
        title: todo.title,
        priority: todo.priority,
        effort: todo.effort ?? "medium",
        deadline: todo.deadline ?? "",
        assignedTo: todo.assignedTo ?? null,
        estimatedMinutes: todo.estimatedMinutes ?? null,
        tags: todo.tags ?? [],
        recurrence: todo.recurrence ?? null,
      });
      setEditAssignEmail("");
      setEditAssignedUser(null);
      setEditAssignError(null);
      if (todo.assignedTo && !userCache[todo.assignedTo]) {
        resolveUser(todo.assignedTo);
      }
    } catch {
      toast.error("Impossible de charger la tâche");
    }
  };

  const saveEdit = async () => {
    if (!editingTodo) return;
    setEditSaving(true);
    try {
      await updateTodo(editingTodo.id, {
        title: editForm.title,
        priority: editForm.priority,
        effort: editForm.effort,
        deadline: editForm.deadline || null,
        assignedTo: editForm.assignedTo,
        estimatedMinutes: editForm.estimatedMinutes,
        tags: editForm.tags,
        recurrence: editForm.recurrence,
      });
      setEditingTodo(null);
      toast.success("Tâche mise à jour");
      const start = weekDays[0].toISOString();
      const endDate = new Date(weekDays[6]);
      endDate.setHours(23, 59, 59, 999);
      const data = await getCalendarEvents(start, endDate.toISOString());
      setWroketEvents(data.wroketEvents);
      setGoogleEvents(data.googleEvents);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de la sauvegarde");
    } finally {
      setEditSaving(false);
    }
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
                { text: t("help.agenda.week" as TranslationKey) },
                { text: t("help.agenda.edit" as TranslationKey) },
                { text: t("help.agenda.google" as TranslationKey) },
                { text: t("help.agenda.colors" as TranslationKey) },
                { text: t("help.agenda.smartSlots" as TranslationKey) },
              ]}
            />
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={goPrev}
                className="rounded p-1.5 text-zinc-500 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Previous week"
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
                aria-label="Next week"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            <span className="text-sm text-zinc-500 dark:text-slate-400 hidden sm:inline">{weekLabel}</span>
          </div>

          <div className="flex items-center gap-2">
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
                {t("agenda.calendars" as TranslationKey)}
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
                      <p className="text-xs text-zinc-400 dark:text-slate-500">{t("settings.noGoogleAccounts" as TranslationKey)}</p>
                    </div>
                  )}
                  <div className="border-t border-zinc-100 dark:border-slate-700 px-3 py-2">
                    <Link
                      href="/agenda/manage"
                      onClick={() => setCalendarMenuOpen(false)}
                      className="block w-full text-center text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                    >
                      {t("agenda.manageCalendars" as TranslationKey)}
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

        {/* Calendar grid */}
        {!loading && (
          <div className="flex-1 overflow-hidden rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <div className="flex flex-col h-full">
              {/* Day headers (sticky) */}
              <div className="flex border-b border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 sticky top-0 z-20">
                <div className="w-14 shrink-0 border-r border-zinc-100 dark:border-slate-800" />
                {weekDays.map((day, i) => {
                  const isToday = isSameDay(day, today);
                  return (
                    <div
                      key={i}
                      className={`flex-1 min-w-[100px] text-center py-2 border-r border-zinc-100 dark:border-slate-800 last:border-r-0 ${
                        isToday ? "bg-blue-50/50 dark:bg-blue-950/20" : ""
                      }`}
                    >
                      <div className="text-[11px] uppercase tracking-wide text-zinc-400 dark:text-slate-500 font-medium">
                        {dayNames[i]}
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
              {hasAllDayEvents && (
                <div className="flex border-b border-zinc-200 dark:border-slate-700 bg-zinc-50/50 dark:bg-slate-800/30">
                  <div className="w-14 shrink-0 border-r border-zinc-100 dark:border-slate-800 flex items-center justify-center">
                    <span className="text-[10px] text-zinc-400 dark:text-slate-500">{t("agenda.allDay")}</span>
                  </div>
                  {weekDays.map((day, i) => {
                    const dayAllDay = eventsForDay(day, true);
                    return (
                      <div key={i} className="flex-1 min-w-[100px] p-1 border-r border-zinc-100 dark:border-slate-800 last:border-r-0 space-y-0.5">
                        {dayAllDay.map((ev) => {
                          const isWroket = ev.source === "wroket";
                          const qc = isWroket ? QUADRANT_COLORS[classifyEvent(ev)] : null;
                          const acctColor = !isWroket ? getAccountColor(ev.accountEmail) : "";
                          return (
                            <div
                              key={ev.id}
                              className={`rounded px-1.5 py-0.5 text-[11px] truncate border-l-2 ${
                                isWroket && qc
                                  ? `${qc.bg} ${qc.border} ${qc.text} cursor-pointer`
                                  : "text-zinc-800 dark:text-slate-200"
                              }`}
                              style={!isWroket ? { borderLeftColor: acctColor, backgroundColor: hexToTintBg(acctColor, 0.18) } : undefined}
                              onDoubleClick={() => handleDoubleClickEvent(ev)}
                            >
                              {isWroket && qc ? `${qc.icon} ` : ""}{ev.summary}
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
                  {weekDays.map((day, dayIdx) => {
                    const isToday = isSameDay(day, today);
                    const dayEvents = eventsForDay(day, false);
                    return (
                      <div
                        key={dayIdx}
                        className={`flex-1 min-w-[100px] relative border-r border-zinc-100 dark:border-slate-800 last:border-r-0 ${
                          isToday ? "bg-blue-50/30 dark:bg-blue-950/20" : ""
                        }`}
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
                          const pos = getEventPosition(ev);
                          const isWroket = ev.source === "wroket";
                          const qc = isWroket ? QUADRANT_COLORS[classifyEvent(ev)] : null;
                          const acctColor = !isWroket ? getAccountColor(ev.accountEmail) : "";
                          const googleTitle = !isWroket
                            ? `${ev.summary} (${ev.accountEmail ?? t("agenda.googleEvent")})`
                            : undefined;
                          return (
                            <div
                              key={ev.id}
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
                              title={isWroket && qc ? `${ev.summary} — ${qc.icon} ${qc.label}` : googleTitle}
                              onDoubleClick={() => handleDoubleClickEvent(ev)}
                            >
                              <div className="text-xs font-semibold truncate leading-snug">
                                {isWroket && qc ? `${qc.icon} ` : ""}{ev.summary}
                              </div>
                              {pos.height >= 36 && (
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
          onAssignLookup={() => {}}
          onClearAssign={() => setEditForm((f) => ({ ...f, assignedTo: null }))}
          userDisplayName={displayName}
          effortDefaults={user?.effortMinutes}
          currentUserUid={user?.uid}
        />
      </div>
    </AppShell>
  );
}
