"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import {
  getCalendarEvents,
  getGoogleAuthUrl,
  disconnectGoogleCalendar,
  getMe,
  type CalendarEvent,
  type Todo,
} from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import { classify, type EisenhowerQuadrant } from "@/lib/classify";

const HOUR_HEIGHT = 60;
const DAY_START_HOUR = 6;
const DAY_END_HOUR = 22;
const TOTAL_HOURS = DAY_END_HOUR - DAY_START_HOUR;

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

export default function AgendaPage() {
  const { t, locale } = useLocale();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [wroketEvents, setWroketEvents] = useState<CalendarEvent[]>([]);
  const [googleEvents, setGoogleEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await getMe();
        if (!cancelled) setGoogleConnected(!!me.googleCalendarConnected);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

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

  const handleConnectGoogle = async () => {
    try {
      const { url } = await getGoogleAuthUrl();
      window.location.href = url;
    } catch { /* ignore */ }
  };

  const handleDisconnectGoogle = async () => {
    try {
      await disconnectGoogleCalendar();
      setGoogleConnected(false);
      setGoogleEvents([]);
    } catch { /* ignore */ }
  };

  const allEvents = useMemo(() => [...wroketEvents, ...googleEvents], [wroketEvents, googleEvents]);

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
    const s = fmt.format(weekDays[0]);
    const e = fmt.format(weekDays[6]);
    const startDay = weekDays[0].getDate();
    const endParts = fmt.formatToParts(weekDays[6]);
    const endDay = endParts.find((p) => p.type === "day")?.value ?? "";
    const endMonth = endParts.find((p) => p.type === "month")?.value ?? "";
    const endYear = endParts.find((p) => p.type === "year")?.value ?? "";
    if (weekDays[0].getMonth() === weekDays[6].getMonth()) {
      return `${startDay} - ${endDay} ${endMonth} ${endYear}`;
    }
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

  return (
    <AppShell>
      <div className="flex flex-col h-[calc(100vh-120px)]">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-zinc-900 dark:text-slate-100">{t("agenda.title")}</h1>
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
            {googleConnected ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                  {t("agenda.googleConnected")}
                </span>
                <button
                  type="button"
                  onClick={handleDisconnectGoogle}
                  className="rounded px-2.5 py-1 text-xs text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                >
                  {t("agenda.disconnect")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleConnectGoogle}
                className="rounded px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                {t("agenda.connectGoogle")}
              </button>
            )}
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
                          return (
                            <div
                              key={ev.id}
                              className={`rounded px-1.5 py-0.5 text-[11px] truncate border-l-2 ${
                                isWroket && qc
                                  ? `${qc.bg} ${qc.border} ${qc.text}`
                                  : "bg-emerald-100 dark:bg-emerald-900/40 border-emerald-500 text-emerald-800 dark:text-emerald-200"
                              }`}
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
                          return (
                            <div
                              key={ev.id}
                              className={`absolute left-1 right-1 rounded px-1.5 py-0.5 overflow-hidden cursor-default transition-shadow hover:shadow-lg hover:z-30 z-10 border-l-[3px] shadow-sm ${
                                isWroket && qc
                                  ? `${qc.bg} ${qc.border} ${qc.text}`
                                  : "bg-emerald-100 dark:bg-emerald-900/40 border-emerald-500 text-emerald-800 dark:text-emerald-200"
                              }`}
                              style={{ top: pos.top, height: pos.height, minHeight: 22 }}
                              title={`${ev.summary}${isWroket && qc ? ` — ${qc.icon} ${qc.label}` : ` (${t("agenda.googleEvent")})`}`}
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
      </div>
    </AppShell>
  );
}
