"use client";

import { useMemo, useRef, useCallback, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortablePhaseContainer, SortableBoardTaskRow } from "./DndWrappers";
import type { ProjectPhase, Todo, TranslationKey } from "./types";

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
  return d.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", { month: "short" }).toUpperCase();
}

function yearLabel(d: Date): string {
  return String(d.getFullYear()).slice(-2);
}

interface GanttChartProps {
  phases: ProjectPhase[];
  tasks: Todo[];
  t: (key: TranslationKey) => string;
  locale: string;
  onMoveTask?: (taskId: string, newPhaseId: string | null, newIndex: number) => void;
  /** When true, show "convert phase to sub-project" on real phase headers (root projects only). */
  canConvertPhaseToSubproject?: boolean;
  onConvertPhase?: (phaseId: string) => void;
}

export default function GanttChart({ phases, tasks, t, locale, onMoveTask, canConvertPhaseToSubproject, onConvertPhase }: GanttChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const parentTasks = useMemo(() => tasks.filter((td) => !td.parentId), [tasks]);
  const subtasksByParent = useMemo(() => {
    const map = new Map<string, Todo[]>();
    for (const td of tasks) {
      if (td.parentId) {
        const list = map.get(td.parentId) ?? [];
        list.push(td);
        map.set(td.parentId, list);
      }
    }
    return map;
  }, [tasks]);

  const chronoPhases = useMemo(() => {
    return [...phases].sort((a, b) => {
      const aStart = a.startDate ? parseDate(a.startDate).getTime() : Infinity;
      const bStart = b.startDate ? parseDate(b.startDate).getTime() : Infinity;
      return aStart - bStart;
    });
  }, [phases]);

  const tasksByPhase = useMemo(() => {
    const map = new Map<string, Todo[]>();
    for (const p of phases) map.set(p.id, []);
    const unassigned: Todo[] = [];
    for (const task of parentTasks) {
      if (task.phaseId && map.has(task.phaseId)) {
        map.get(task.phaseId)!.push(task);
      } else {
        unassigned.push(task);
      }
    }
    const chronoSort = (a: Todo, b: Todo) => {
      const aDate = a.startDate ?? a.deadline ?? "9999";
      const bDate = b.startDate ?? b.deadline ?? "9999";
      return aDate.localeCompare(bDate);
    };
    for (const [, list] of map) list.sort(chronoSort);
    unassigned.sort(chronoSort);
    map.set("__none__", unassigned);
    return map;
  }, [phases, parentTasks]);

  const { minDate, totalDays, months, phaseBarData } = useMemo(() => {
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
      return { minDate: today, totalDays: 30, months: [], phaseBarData: new Map<string, { startDay: number | null; endDay: number | null }>() };
    }

    const sorted = allDates.sort((a, b) => a.getTime() - b.getTime());
    const minD = addDays(sorted[0], -3);
    const maxD = addDays(sorted[sorted.length - 1], 7);
    const total = Math.max(daysBetween(minD, maxD), 14);

    const pbd = new Map<string, { startDay: number | null; endDay: number | null }>();
    for (const phase of phases) {
      pbd.set(phase.id, {
        startDay: phase.startDate ? daysBetween(minD, parseDate(phase.startDate)) : null,
        endDay: phase.endDate ? daysBetween(minD, parseDate(phase.endDate)) : null,
      });
    }

    const builtMonths: { label: string; year: string; leftPx: number; widthPx: number }[] = [];
    let cursor = new Date(minD);
    const COL = 28;
    while (cursor <= maxD) {
      const mStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const mEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      const effStart = mStart < minD ? minD : mStart;
      const effEnd = mEnd > maxD ? maxD : mEnd;
      const span = daysBetween(effStart, effEnd) + 1;
      builtMonths.push({
        label: monthLabel(cursor, locale),
        year: yearLabel(cursor),
        leftPx: daysBetween(minD, effStart) * COL,
        widthPx: span * COL,
      });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }

    return { minDate: minD, totalDays: total, months: builtMonths, phaseBarData: pbd };
  }, [phases, tasks, locale]);

  const getTaskBar = useCallback((task: Todo) => {
    const startDay = task.startDate ? daysBetween(minDate, parseDate(task.startDate)) : null;
    const endDay = task.deadline ? daysBetween(minDate, parseDate(task.deadline)) : null;
    return { startDay, endDay };
  }, [minDate]);

  const [draggedId, setDraggedId] = useState<string | null>(null);

  const findPhaseForTask = useCallback((taskId: string): string => {
    for (const [phaseId, list] of tasksByPhase) {
      if (list.some((td) => td.id === taskId)) return phaseId;
    }
    return "__none__";
  }, [tasksByPhase]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDraggedId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setDraggedId(null);
    if (!onMoveTask) return;
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const sourcePhase = findPhaseForTask(activeId);
    const allPhaseIds = [...phases.map((p) => p.id), "__none__"];
    const isOverAPhase = allPhaseIds.includes(overId);
    const targetPhase = isOverAPhase ? overId : findPhaseForTask(overId);
    const targetTasks = tasksByPhase.get(targetPhase) ?? [];

    if (sourcePhase === targetPhase && !isOverAPhase) {
      const oldIndex = targetTasks.findIndex((td) => td.id === activeId);
      const newIndex = targetTasks.findIndex((td) => td.id === overId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
      onMoveTask(activeId, targetPhase === "__none__" ? null : targetPhase, newIndex);
    } else {
      let insertIndex = targetTasks.length;
      if (!isOverAPhase) {
        const overIndex = targetTasks.findIndex((td) => td.id === overId);
        if (overIndex !== -1) insertIndex = overIndex;
      }
      onMoveTask(activeId, targetPhase === "__none__" ? null : targetPhase, insertIndex);
    }
  }, [onMoveTask, findPhaseForTask, phases, tasksByPhase]);

  const draggedTask = useMemo(
    () => (draggedId ? parentTasks.find((td) => td.id === draggedId) ?? null : null),
    [draggedId, parentTasks],
  );

  const todayOffset = daysBetween(minDate, new Date());
  const COL_W = 28;

  const hasData = parentTasks.length > 0;

  if (!hasData) {
    return (
      <div className="text-center py-12 text-sm text-zinc-400 dark:text-slate-500 italic">
        {t("gantt.noData")}
      </div>
    );
  }

  const chartWidth = totalDays * COL_W;
  const labelW = 240;

  const renderBar = (startDay: number | null, endDay: number | null, color: string, opacity: number, height: string, label?: string) => {
    const barStart = startDay ?? 0;
    const barEnd = endDay ?? barStart;
    const barWidth = Math.max(barEnd - barStart + 1, 1);
    const hasBar = startDay !== null || endDay !== null;
    if (!hasBar) return null;
    return (
      <div
        className={`absolute rounded-sm ${height}`}
        style={{
          left: barStart * COL_W + 2,
          width: barWidth * COL_W - 4,
          backgroundColor: color,
          opacity,
        }}
      >
        {label && barWidth * COL_W > 60 && (
          <span className="text-[9px] text-white font-medium px-1.5 leading-[18px] truncate block">
            {label}
          </span>
        )}
      </div>
    );
  };

  const renderTaskRow = (task: Todo, numbering: string, color: string, isSubtask: boolean) => {
    const bar = getTaskBar(task);
    const rowHeight = isSubtask ? 26 : 32;
    const barTop = isSubtask ? "top-[5px] h-[14px]" : "top-[7px] h-[18px]";
    const barOpacity = task.status === "completed" ? 0.35 : isSubtask ? 0.5 : 0.65;
    const labelPl = isSubtask ? "pl-14" : "pl-8";

    return (
      <div className="flex items-center border-b border-zinc-100 dark:border-slate-800" style={{ height: rowHeight }}>
        <div className={`w-[${labelW}px] shrink-0 px-3 truncate text-xs text-zinc-600 dark:text-slate-400 ${labelPl}`} style={{ width: labelW }}>
          {numbering && (
            <span className="text-[10px] font-mono font-semibold text-zinc-400 dark:text-slate-500 mr-1.5">{numbering}</span>
          )}
          {isSubtask && <span className="text-zinc-300 dark:text-slate-600 mr-1">↳</span>}
          <span className={`${task.status === "completed" ? "line-through opacity-60" : ""} ${isSubtask ? "text-[11px]" : ""}`}>{task.title}</span>
        </div>
        <div className="flex-1 relative" style={{ height: "100%" }}>
          {renderBar(bar.startDay, bar.endDay, color, barOpacity, barTop, !isSubtask ? task.title : undefined)}
        </div>
      </div>
    );
  };

  const renderPhaseSection = (phaseId: string, phaseName: string, phaseColor: string, phaseBar: { startDay: number | null; endDay: number | null } | null) => {
    const phaseTasks = tasksByPhase.get(phaseId) ?? [];
    let counter = 0;
    const showConvert = phaseId !== "__none__" && canConvertPhaseToSubproject && onConvertPhase;

    return (
      <div key={phaseId}>
        <div className="flex items-center border-b border-zinc-100 dark:border-slate-800 bg-zinc-50/50 dark:bg-slate-800/30" style={{ height: 36 }}>
          <div className="shrink-0 px-3 font-semibold text-xs text-zinc-700 dark:text-slate-300 flex items-center gap-1 min-w-0" style={{ width: labelW }}>
            <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0 align-middle" style={{ backgroundColor: phaseColor }} />
            <span className="truncate flex-1 min-w-0">{phaseName}</span>
            {showConvert ? (
              <button
                type="button"
                onClick={() => onConvertPhase(phaseId)}
                className="shrink-0 text-zinc-400 hover:text-cyan-500 transition-colors p-0.5"
                title={t("projects.convertToSubproject")}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </button>
            ) : null}
          </div>
          <div className="flex-1 relative" style={{ height: "100%" }}>
            {phaseBar && renderBar(phaseBar.startDay, phaseBar.endDay, phaseColor, 0.85, "top-[8px] h-[20px]")}
          </div>
        </div>

        <SortablePhaseContainer id={phaseId} items={phaseTasks.map((td) => td.id)}>
          {phaseTasks.map((task) => {
            counter++;
            const parentNum = String(counter);
            const subs = subtasksByParent.get(task.id) ?? [];
            return (
              <SortableBoardTaskRow key={task.id} id={task.id}>
                {renderTaskRow(task, parentNum, phaseColor, false)}
                {subs.map((sub, si) => renderTaskRow(sub, `${parentNum}.${si + 1}`, phaseColor, true))}
              </SortableBoardTaskRow>
            );
          })}
        </SortablePhaseContainer>
      </div>
    );
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="overflow-x-auto" ref={containerRef}>
        <div className="relative" style={{ minWidth: chartWidth + labelW }}>
          {/* Single today line spanning entire chart */}
          {todayOffset >= 0 && todayOffset <= totalDays && (
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-red-400 dark:bg-red-500 z-20 pointer-events-none"
              style={{ left: labelW + todayOffset * COL_W + COL_W / 2 }}
            />
          )}

          {/* Month headers */}
          <div className="flex border-b border-zinc-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-900 z-10">
            <div className="shrink-0" style={{ width: labelW }} />
            <div className="flex-1 relative" style={{ height: 28 }}>
              {months.map((m, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 flex items-center text-[10px] font-semibold text-zinc-500 dark:text-slate-400 px-1 border-r border-zinc-100 dark:border-slate-800 uppercase tracking-wider overflow-hidden whitespace-nowrap"
                  style={{ left: m.leftPx, width: m.widthPx }}
                >
                  {m.widthPx > 50 ? `${m.label} ${m.year}` : m.widthPx > 30 ? m.label.slice(0, 3) : ""}
                </div>
              ))}
            </div>
          </div>

          {/* Phase sections sorted chronologically */}
          {chronoPhases.map((phase) =>
            renderPhaseSection(phase.id, phase.name, phase.color, phaseBarData.get(phase.id) ?? null)
          )}

          {(tasksByPhase.get("__none__") ?? []).length > 0 &&
            renderPhaseSection("__none__", t("phase.unassigned"), "#94a3b8", null)
          }

          {/* Today legend */}
          <div className="flex items-center gap-1 mt-2 px-3">
            <div className="w-3 h-0.5 bg-red-400" />
            <span className="text-[10px] text-zinc-400 dark:text-slate-500">{t("gantt.today")}</span>
          </div>
        </div>
      </div>
      <DragOverlay>
        {draggedTask ? (
          <div className="bg-white dark:bg-slate-900 rounded-md border-2 border-blue-400 dark:border-blue-500 px-3 py-1.5 shadow-xl rotate-1 opacity-90 max-w-[240px]">
            <span className="text-xs font-medium text-zinc-800 dark:text-slate-200 truncate block">{draggedTask.title}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
