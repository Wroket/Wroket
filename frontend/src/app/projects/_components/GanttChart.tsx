"use client";

import { useMemo, useRef } from "react";
import type { ProjectPhase, Todo, TodoStatus, TranslationKey } from "./types";

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function monthLabel(d: Date, locale: string): string {
  return d.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", { month: "short", year: "2-digit" });
}

interface GanttChartProps {
  phases: ProjectPhase[];
  tasks: Todo[];
  t: (key: TranslationKey) => string;
  locale: string;
}

export default function GanttChart({ phases, tasks, t, locale }: GanttChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const { rows, minDate, totalDays, months } = useMemo(() => {
    const allDates: Date[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    allDates.push(today);

    for (const p of phases) {
      if (p.startDate) allDates.push(parseDate(p.startDate));
      if (p.endDate) allDates.push(parseDate(p.endDate));
    }
    for (const task of tasks) {
      if (task.startDate) allDates.push(parseDate(task.startDate));
      if (task.deadline) allDates.push(parseDate(task.deadline));
    }

    if (allDates.length <= 1) {
      return { rows: [], minDate: today, totalDays: 30, months: [] };
    }

    const sorted = allDates.sort((a, b) => a.getTime() - b.getTime());
    const minD = addDays(sorted[0], -3);
    const maxD = addDays(sorted[sorted.length - 1], 7);
    const total = Math.max(daysBetween(minD, maxD), 14);

    type Row = {
      type: "phase" | "task" | "subtask";
      label: string;
      numbering: string;
      color: string;
      startDay: number | null;
      endDay: number | null;
      status?: TodoStatus;
    };

    const builtRows: Row[] = [];
    const orderedPhases = [...phases].sort((a, b) => a.order - b.order);
    const tasksByPhase = new Map<string, Todo[]>();
    const unassigned: Todo[] = [];

    const parentTasks = tasks.filter((t) => !t.parentId);
    const subtasksByParent = new Map<string, Todo[]>();
    for (const t of tasks) {
      if (t.parentId) {
        const list = subtasksByParent.get(t.parentId) ?? [];
        list.push(t);
        subtasksByParent.set(t.parentId, list);
      }
    }

    for (const task of parentTasks) {
      if (task.phaseId) {
        const list = tasksByPhase.get(task.phaseId) ?? [];
        list.push(task);
        tasksByPhase.set(task.phaseId, list);
      } else {
        unassigned.push(task);
      }
    }

    let ganttTaskCounter = 0;

    const pushTaskWithSubs = (task: Todo, color: string) => {
      ganttTaskCounter++;
      const parentNum = String(ganttTaskCounter);
      builtRows.push({
        type: "task",
        label: task.title,
        numbering: parentNum,
        color,
        startDay: task.startDate ? daysBetween(minD, parseDate(task.startDate)) : null,
        endDay: task.deadline ? daysBetween(minD, parseDate(task.deadline)) : null,
        status: task.status,
      });
      const subs = subtasksByParent.get(task.id) ?? [];
      for (let si = 0; si < subs.length; si++) {
        const sub = subs[si];
        builtRows.push({
          type: "subtask",
          label: sub.title,
          numbering: `${parentNum}.${si + 1}`,
          color,
          startDay: sub.startDate ? daysBetween(minD, parseDate(sub.startDate)) : null,
          endDay: sub.deadline ? daysBetween(minD, parseDate(sub.deadline)) : null,
          status: sub.status,
        });
      }
    };

    for (const phase of orderedPhases) {
      ganttTaskCounter = 0;
      builtRows.push({
        type: "phase",
        label: phase.name,
        numbering: "",
        color: phase.color,
        startDay: phase.startDate ? daysBetween(minD, parseDate(phase.startDate)) : null,
        endDay: phase.endDate ? daysBetween(minD, parseDate(phase.endDate)) : null,
      });
      const phaseTasks = tasksByPhase.get(phase.id) ?? [];
      for (const task of phaseTasks) {
        pushTaskWithSubs(task, phase.color);
      }
    }

    if (unassigned.length > 0) {
      ganttTaskCounter = 0;
      builtRows.push({
        type: "phase",
        label: t("phase.unassigned" as TranslationKey),
        numbering: "",
        color: "#94a3b8",
        startDay: null,
        endDay: null,
      });
      for (const task of unassigned) {
        pushTaskWithSubs(task, "#94a3b8");
      }
    }

    const builtMonths: { label: string; startDay: number; span: number }[] = [];
    let cursor = new Date(minD);
    while (cursor <= maxD) {
      const mStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const mEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      const effStart = mStart < minD ? minD : mStart;
      const effEnd = mEnd > maxD ? maxD : mEnd;
      builtMonths.push({
        label: monthLabel(cursor, locale),
        startDay: daysBetween(minD, effStart),
        span: daysBetween(effStart, effEnd) + 1,
      });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }

    return { rows: builtRows, minDate: minD, totalDays: total, months: builtMonths };
  }, [phases, tasks, t, locale]);

  const todayOffset = daysBetween(minDate, new Date());
  const COL_W = 28;

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-zinc-400 dark:text-slate-500 italic">
        {t("gantt.noData" as TranslationKey)}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto" ref={containerRef}>
      <div style={{ minWidth: totalDays * COL_W + 240 }}>
        <div className="flex border-b border-zinc-200 dark:border-slate-700">
          <div className="w-[240px] shrink-0" />
          <div className="flex-1 flex">
            {months.map((m, i) => (
              <div
                key={i}
                style={{ width: m.span * COL_W, marginLeft: i === 0 ? m.startDay * COL_W : 0 }}
                className="text-[10px] font-semibold text-zinc-500 dark:text-slate-400 px-1 py-1 border-r border-zinc-100 dark:border-slate-800 uppercase tracking-wider"
              >
                {m.label}
              </div>
            ))}
          </div>
        </div>

        {rows.map((row, ri) => {
          const isPhase = row.type === "phase";
          const isSubtask = row.type === "subtask";
          const barStart = row.startDay ?? 0;
          const barEnd = row.endDay ?? barStart;
          const barWidth = Math.max(barEnd - barStart + 1, 1);
          const hasBar = row.startDay !== null || row.endDay !== null;

          const rowHeight = isPhase ? 36 : isSubtask ? 26 : 32;
          const labelPl = isPhase ? "" : isSubtask ? "pl-14" : "pl-8";
          const barTop = isPhase ? "top-[8px] h-[20px]" : isSubtask ? "top-[5px] h-[14px]" : "top-[7px] h-[18px]";
          const barOpacity = isPhase ? 0.85 : (row.status === "completed" ? 0.35 : isSubtask ? 0.5 : 0.65);

          return (
            <div
              key={ri}
              className={`flex items-center border-b border-zinc-100 dark:border-slate-800 ${isPhase ? "bg-zinc-50/50 dark:bg-slate-800/30" : ""}`}
              style={{ height: rowHeight }}
            >
              <div className={`w-[240px] shrink-0 px-3 truncate ${isPhase ? "font-semibold text-xs text-zinc-700 dark:text-slate-300" : `text-xs text-zinc-600 dark:text-slate-400 ${labelPl}`}`}>
                {isPhase && (
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-sm mr-2 align-middle"
                    style={{ backgroundColor: row.color }}
                  />
                )}
                {!isPhase && row.numbering && (
                  <span className="text-[10px] font-mono font-semibold text-zinc-400 dark:text-slate-500 mr-1.5">{row.numbering}</span>
                )}
                {isSubtask && <span className="text-zinc-300 dark:text-slate-600 mr-1">↳</span>}
                <span className={`${row.status === "completed" ? "line-through opacity-60" : ""} ${isSubtask ? "text-[11px]" : ""}`}>{row.label}</span>
              </div>

              <div className="flex-1 relative" style={{ height: "100%" }}>
                {todayOffset >= 0 && todayOffset <= totalDays && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-red-400 dark:bg-red-500 z-10"
                    style={{ left: todayOffset * COL_W + COL_W / 2 }}
                  />
                )}

                {hasBar && (
                  <div
                    className={`absolute rounded-sm ${barTop}`}
                    style={{
                      left: barStart * COL_W + 2,
                      width: barWidth * COL_W - 4,
                      backgroundColor: row.color,
                      opacity: barOpacity,
                    }}
                  >
                    {!isPhase && !isSubtask && barWidth * COL_W > 60 && (
                      <span className="text-[9px] text-white font-medium px-1.5 leading-[18px] truncate block">
                        {row.label}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div className="flex items-center gap-1 mt-2 px-3">
          <div className="w-3 h-0.5 bg-red-400" />
          <span className="text-[10px] text-zinc-400 dark:text-slate-500">{t("gantt.today" as TranslationKey)}</span>
        </div>
      </div>
    </div>
  );
}
