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

const COL_W = 28;
const HANDLE_W = 8;
const DRAG_THRESHOLD_PX = 4;
const HEADER_MONTH_H = 24;
const HEADER_WEEK_H = 20;
const HEADER_TOTAL_H = HEADER_MONTH_H + HEADER_WEEK_H;

/** Monday for fr, Sunday for en (week boundary labels + lines). */
function weekStartDay(locale: string): number {
  return locale === "fr" ? 1 : 0;
}

function isWeekStart(date: Date, locale: string): boolean {
  return date.getDay() === weekStartDay(locale);
}

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

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function sortTasksByOrder(a: Todo, b: Todo): number {
  const oa = a.sortOrder ?? Number.POSITIVE_INFINITY;
  const ob = b.sortOrder ?? Number.POSITIVE_INFINITY;
  if (oa !== ob) return oa - ob;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

function normalizeRange(start: string | null, end: string | null): { start: string | null; end: string | null } {
  if (start && end && start > end) return { start: end, end: start };
  return { start, end };
}

type BarDragMode = "move" | "resize-start" | "resize-end";

function resolveDraggedDates(
  mode: BarDragMode,
  origStart: string | null,
  origEnd: string | null,
  deltaDays: number,
): { start: string | null; end: string | null } | null {
  const baseStart = origStart ?? origEnd;
  const baseEnd = origEnd ?? origStart;
  if (!baseStart && !baseEnd) return null;

  let newStart = baseStart;
  let newEnd = baseEnd;

  if (mode === "move") {
    newStart = baseStart ? addDaysYmd(baseStart, deltaDays) : null;
    newEnd = baseEnd ? addDaysYmd(baseEnd, deltaDays) : null;
  } else if (mode === "resize-start") {
    newStart = baseStart ? addDaysYmd(baseStart, deltaDays) : (baseEnd ? addDaysYmd(baseEnd, deltaDays) : null);
    newEnd = baseEnd;
  } else {
    newStart = baseStart;
    newEnd = baseEnd ? addDaysYmd(baseEnd, deltaDays) : (baseStart ? addDaysYmd(baseStart, deltaDays) : null);
  }

  return normalizeRange(newStart, newEnd);
}

interface DragPreview {
  kind: "task" | "phase";
  id: string;
  startDay: number | null;
  endDay: number | null;
}

interface BarDragState {
  mode: BarDragMode;
  kind: "task" | "phase";
  id: string;
  startX: number;
  origStart: string | null;
  origEnd: string | null;
  moved: boolean;
}

interface GanttChartProps {
  phases: ProjectPhase[];
  tasks: Todo[];
  t: (key: TranslationKey) => string;
  locale: string;
  variant?: "interactive" | "export";
  onMoveTask?: (taskId: string, newPhaseId: string | null, newIndex: number) => void;
  onTaskClick?: (task: Todo) => void;
  onPhaseClick?: (phase: ProjectPhase) => void;
  onBarDateMove?: (taskId: string, startDate: string | null, deadline: string | null) => void;
  onPhaseDateChange?: (phaseId: string, startDate: string | null, endDate: string | null) => void;
  canConvertPhaseToSubproject?: boolean;
  onConvertPhase?: (phaseId: string) => void;
}

interface GanttChartBodyProps {
  phases: ProjectPhase[];
  tasks: Todo[];
  t: (key: TranslationKey) => string;
  locale: string;
  isExport: boolean;
  onTaskClick?: (task: Todo) => void;
  onPhaseClick?: (phase: ProjectPhase) => void;
  onBarDateMove?: (taskId: string, startDate: string | null, deadline: string | null) => void;
  onPhaseDateChange?: (phaseId: string, startDate: string | null, endDate: string | null) => void;
  canConvertPhaseToSubproject?: boolean;
  onConvertPhase?: (phaseId: string) => void;
}

interface WeekTick {
  dayIndex: number;
  label: number;
}

interface GanttTimelineGridProps {
  chartWidth: number;
  totalDays: number;
  months: { leftPx: number }[];
  weekLineDays: number[];
  dragPreview: DragPreview | null;
  isExport: boolean;
}

function GanttTimelineGrid({
  chartWidth,
  totalDays,
  months,
  weekLineDays,
  dragPreview,
  isExport,
}: GanttTimelineGridProps) {
  const dayLineColor = isExport ? "rgba(228, 228, 231, 0.95)" : "rgba(161, 161, 170, 0.22)";
  const weekLineClass = isExport
    ? "bg-zinc-300"
    : "bg-zinc-200 dark:bg-slate-600";
  const monthLineClass = isExport
    ? "bg-zinc-400"
    : "bg-zinc-300 dark:bg-slate-500";

  const highlightStart = dragPreview
    ? (dragPreview.startDay ?? dragPreview.endDay ?? 0)
    : null;
  const highlightEnd = dragPreview
    ? (dragPreview.endDay ?? dragPreview.startDay ?? highlightStart ?? 0)
    : null;

  return (
    <div
      className="relative h-full w-full pointer-events-none"
      aria-hidden
      style={{
        backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent ${COL_W - 1}px, ${dayLineColor} ${COL_W - 1}px, ${dayLineColor} ${COL_W}px)`,
      }}
    >
      {weekLineDays.map((dayIndex) => (
        <div
          key={`w-${dayIndex}`}
          className={`absolute top-0 bottom-0 w-px ${weekLineClass}`}
          style={{ left: dayIndex * COL_W }}
        />
      ))}
      {months.map((m, i) => (
        <div
          key={`m-${i}`}
          className={`absolute top-0 bottom-0 w-px ${monthLineClass}`}
          style={{ left: m.leftPx }}
        />
      ))}
      {highlightStart !== null && highlightEnd !== null && Array.from(
        { length: Math.max(highlightEnd - highlightStart + 1, 1) },
        (_, i) => highlightStart + i,
      ).map((dayIndex) => (
        <div
          key={`h-${dayIndex}`}
          className={isExport ? "absolute top-0 bottom-0 bg-blue-500/8" : "absolute top-0 bottom-0 bg-blue-500/5 dark:bg-blue-400/10"}
          style={{ left: dayIndex * COL_W, width: COL_W }}
        />
      ))}
      <div
        className={`absolute top-0 right-0 bottom-0 w-px ${monthLineClass}`}
        style={{ left: totalDays * COL_W }}
      />
    </div>
  );
}

function GanttChartBody({
  phases,
  tasks,
  t,
  locale,
  isExport,
  onTaskClick,
  onPhaseClick,
  onBarDateMove,
  onPhaseDateChange,
  canConvertPhaseToSubproject,
  onConvertPhase,
}: GanttChartBodyProps) {
  const barDragRef = useRef<BarDragState | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);

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

  const phaseById = useMemo(() => {
    const map = new Map<string, ProjectPhase>();
    for (const p of phases) map.set(p.id, p);
    return map;
  }, [phases]);

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
    const chronoSort = sortTasksByOrder;
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
    while (cursor <= maxD) {
      const mStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const mEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      const effStart = mStart < minD ? minD : mStart;
      const effEnd = mEnd > maxD ? maxD : mEnd;
      const span = daysBetween(effStart, effEnd) + 1;
      builtMonths.push({
        label: monthLabel(cursor, locale),
        year: yearLabel(cursor),
        leftPx: daysBetween(minD, effStart) * COL_W,
        widthPx: span * COL_W,
      });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }

    return { minDate: minD, totalDays: total, months: builtMonths, phaseBarData: pbd };
  }, [phases, tasks, locale]);

  const { weekTicks, weekLineDays } = useMemo(() => {
    const lineDays: number[] = [];
    const ticks: WeekTick[] = [];
    const labeledDays = new Set<number>();

    for (let d = 0; d <= totalDays; d++) {
      const date = addDays(minDate, d);
      const weekStart = isWeekStart(date, locale);
      const monthStart = date.getDate() === 1;

      if (weekStart) {
        lineDays.push(d);
        if (!labeledDays.has(d)) {
          ticks.push({ dayIndex: d, label: date.getDate() });
          labeledDays.add(d);
        }
      }
      if (monthStart && !labeledDays.has(d)) {
        ticks.push({ dayIndex: d, label: date.getDate() });
        labeledDays.add(d);
      }
    }

    return { weekTicks: ticks, weekLineDays: lineDays };
  }, [minDate, totalDays, locale]);

  const ymdToBarDays = useCallback((start: string | null, end: string | null) => {
    const startDay = start ? daysBetween(minDate, parseDate(start)) : null;
    const endDay = end ? daysBetween(minDate, parseDate(end)) : null;
    return { startDay, endDay };
  }, [minDate]);

  const getTaskBar = useCallback((task: Todo) => {
    if (dragPreview?.kind === "task" && dragPreview.id === task.id) {
      return { startDay: dragPreview.startDay, endDay: dragPreview.endDay };
    }
    const startDay = task.startDate ? daysBetween(minDate, parseDate(task.startDate)) : null;
    const endDay = task.deadline ? daysBetween(minDate, parseDate(task.deadline)) : null;
    return { startDay, endDay };
  }, [minDate, dragPreview]);

  const getPhaseBarDays = useCallback((
    phaseId: string,
    fallback: { startDay: number | null; endDay: number | null },
  ): { startDay: number | null; endDay: number | null } => {
    if (dragPreview?.kind === "phase" && dragPreview.id === phaseId) {
      return { startDay: dragPreview.startDay, endDay: dragPreview.endDay };
    }
    return fallback;
  }, [dragPreview]);

  const applyBarDrag = useCallback((drag: BarDragState, deltaDays: number, asClick: boolean) => {
    if (asClick) {
      if (drag.kind === "task") {
        const task = tasks.find((td) => td.id === drag.id);
        if (task && onTaskClick) onTaskClick(task);
      } else {
        const phase = phaseById.get(drag.id);
        if (phase && onPhaseClick) onPhaseClick(phase);
      }
      return;
    }
    if (deltaDays === 0) return;

    const normalized = resolveDraggedDates(drag.mode, drag.origStart, drag.origEnd, deltaDays);
    if (!normalized) return;

    if (drag.kind === "task" && onBarDateMove) {
      onBarDateMove(drag.id, normalized.start, normalized.end);
    } else if (drag.kind === "phase" && onPhaseDateChange) {
      onPhaseDateChange(drag.id, normalized.start, normalized.end);
    }
  }, [tasks, phaseById, onTaskClick, onPhaseClick, onBarDateMove, onPhaseDateChange]);

  const beginBarPointer = useCallback((
    e: React.PointerEvent,
    mode: BarDragMode,
    kind: "task" | "phase",
    id: string,
    origStart: string | null,
    origEnd: string | null,
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    barDragRef.current = {
      mode,
      kind,
      id,
      startX: e.clientX,
      origStart,
      origEnd,
      moved: false,
    };
    const onMove = (ev: PointerEvent) => {
      const drag = barDragRef.current;
      if (!drag) return;
      const dx = ev.clientX - drag.startX;
      if (Math.abs(dx) >= DRAG_THRESHOLD_PX) drag.moved = true;
      if (drag.moved) {
        const deltaDays = Math.round(dx / COL_W);
        const dates = resolveDraggedDates(drag.mode, drag.origStart, drag.origEnd, deltaDays);
        if (dates) {
          const days = ymdToBarDays(dates.start, dates.end);
          setDragPreview({ kind: drag.kind, id: drag.id, ...days });
        }
      }
      ev.preventDefault();
    };
    const endDrag = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      const drag = barDragRef.current;
      barDragRef.current = null;
      setDragPreview(null);
      if (!drag) return;
      const deltaDays = Math.round((ev.clientX - drag.startX) / COL_W);
      const asClick = drag.mode === "move" && !drag.moved;
      applyBarDrag(drag, deltaDays, asClick);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
  }, [applyBarDrag, ymdToBarDays]);

  const todayOffset = daysBetween(minDate, new Date());
  const chartWidth = totalDays * COL_W;
  const labelW = 240;
  const totalWidth = chartWidth + labelW;

  const timelineStyle = isExport ? { width: chartWidth, flexShrink: 0 as const } : undefined;
  const timelineClass = isExport ? "relative shrink-0" : "flex-1 relative";

  const renderBar = (
    startDay: number | null,
    endDay: number | null,
    color: string,
    opacity: number,
    height: string,
    label: string | undefined,
    barKind: "task" | "phase" | null,
    barId: string | null,
    origStart: string | null,
    origEnd: string | null,
    interactive: boolean,
    isPreview = false,
  ) => {
    const barStart = startDay ?? 0;
    const barEnd = endDay ?? barStart;
    const barWidth = Math.max(barEnd - barStart + 1, 1);
    const hasBar = startDay !== null || endDay !== null;
    if (!hasBar || !barKind || !barId) return null;

    const canInteract = interactive && (onBarDateMove || onPhaseDateChange || onTaskClick || onPhaseClick);
    const barPx = barWidth * COL_W - 4;

    return (
      <div
        className={`absolute rounded-sm ${height} group/bar ${canInteract ? " z-10" : ""}${isPreview ? " ring-2 ring-blue-300 dark:ring-blue-400 shadow-md z-30" : ""}`}
        style={{
          left: barStart * COL_W + 2,
          width: barPx,
          backgroundColor: color,
          opacity: isPreview ? Math.min(opacity + 0.2, 1) : opacity,
        }}
      >
        {canInteract && (
          <>
            <div
              className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-l-sm hover:bg-white/25 z-20"
              style={{ width: HANDLE_W }}
              title={t("gantt.resizeStart")}
              onPointerDown={(e) => beginBarPointer(e, "resize-start", barKind, barId, origStart, origEnd)}
            />
            <div
              className="absolute right-0 top-0 bottom-0 cursor-ew-resize rounded-r-sm hover:bg-white/25 z-20"
              style={{ width: HANDLE_W }}
              title={t("gantt.resizeEnd")}
              onPointerDown={(e) => beginBarPointer(e, "resize-end", barKind, barId, origStart, origEnd)}
            />
            <div
              className="absolute top-0 bottom-0 cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-blue-400/40 rounded-sm"
              style={{ left: HANDLE_W, right: HANDLE_W }}
              onPointerDown={(e) => beginBarPointer(e, "move", barKind, barId, origStart, origEnd)}
            />
          </>
        )}
        {label && barPx > 60 && (
          <span className="relative z-[1] pointer-events-none text-[9px] text-white font-medium px-1.5 leading-[18px] truncate block">
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
    const textMuted = isExport ? "text-zinc-600" : "text-zinc-600 dark:text-slate-400";
    const borderCls = isExport ? "border-zinc-100" : "border-zinc-100 dark:border-slate-800";
    const hasBar = bar.startDay !== null || bar.endDay !== null;
    const rowInteractive = !isExport && onTaskClick;
    const barInteractive = !isExport && !!(onBarDateMove || onTaskClick);
    const isPreview = dragPreview?.kind === "task" && dragPreview.id === task.id;

    return (
      <div className={`flex items-center border-b ${borderCls}`} style={{ height: rowHeight }}>
        <button
          type="button"
          className={`shrink-0 px-3 truncate text-xs text-left ${textMuted} ${labelPl} ${rowInteractive ? "hover:bg-zinc-50 dark:hover:bg-slate-800/50 cursor-pointer" : ""}`}
          style={{ width: labelW }}
          onClick={rowInteractive ? () => onTaskClick!(task) : undefined}
          title={rowInteractive ? t("gantt.clickToEdit") : undefined}
        >
          {numbering && (
            <span className={`text-[10px] font-mono font-semibold mr-1.5 ${isExport ? "text-zinc-400" : "text-zinc-400 dark:text-slate-500"}`}>{numbering}</span>
          )}
          {isSubtask && <span className={`mr-1 ${isExport ? "text-zinc-300" : "text-zinc-300 dark:text-slate-600"}`}>↳</span>}
          <span className={`${task.status === "completed" ? "line-through opacity-60" : ""} ${isSubtask ? "text-[11px]" : ""}`}>{task.title}</span>
        </button>
        <div className={`${timelineClass} relative`} style={{ ...timelineStyle, height: "100%" }}>
          {hasBar && renderBar(
            bar.startDay,
            bar.endDay,
            color,
            barOpacity,
            barTop,
            task.title,
            "task",
            task.id,
            task.startDate,
            task.deadline,
            barInteractive,
            isPreview,
          )}
        </div>
      </div>
    );
  };

  const renderTaskList = (phaseTasks: Todo[], phaseColor: string) => {
    let counter = 0;
    return phaseTasks.map((task) => {
      counter++;
      const parentNum = String(counter);
      const subs = subtasksByParent.get(task.id) ?? [];
      const rows = (
        <>
          {renderTaskRow(task, parentNum, phaseColor, false)}
          {subs.map((sub, si) => renderTaskRow(sub, `${parentNum}.${si + 1}`, phaseColor, true))}
        </>
      );
      if (isExport) {
        return <div key={task.id}>{rows}</div>;
      }
      return (
        <SortableBoardTaskRow key={task.id} id={task.id}>
          {rows}
        </SortableBoardTaskRow>
      );
    });
  };

  const renderPhaseSection = (
    phaseId: string,
    phaseName: string,
    phaseColor: string,
    phaseBar: { startDay: number | null; endDay: number | null } | null,
    phase?: ProjectPhase,
  ) => {
    const phaseTasks = tasksByPhase.get(phaseId) ?? [];
    const showConvert = !isExport && phaseId !== "__none__" && canConvertPhaseToSubproject && onConvertPhase;
    const headerBg = isExport ? "bg-zinc-50/50" : "bg-zinc-50/50 dark:bg-slate-800/30";
    const headerText = isExport ? "text-zinc-700" : "text-zinc-700 dark:text-slate-300";
    const borderCls = isExport ? "border-zinc-100" : "border-zinc-100 dark:border-slate-800";
    const phaseInteractive = !isExport && phaseId !== "__none__" && phase && (onPhaseClick || onPhaseDateChange);

    const taskList = renderTaskList(phaseTasks, phaseColor);

    return (
      <div key={phaseId}>
        <div className={`flex items-center border-b ${borderCls}`} style={{ height: 36 }}>
          <div className={`shrink-0 px-3 font-semibold text-xs ${headerText} flex items-center gap-1 min-w-0 ${headerBg}`} style={{ width: labelW }}>
            <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0 align-middle" style={{ backgroundColor: phaseColor }} />
            {phaseInteractive ? (
              <button
                type="button"
                className="truncate flex-1 min-w-0 text-left hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
                onClick={() => onPhaseClick!(phase!)}
                title={t("gantt.clickToEditPhase")}
              >
                {phaseName}
              </button>
            ) : (
              <span className="truncate flex-1 min-w-0">{phaseName}</span>
            )}
            {showConvert ? (
              <button
                type="button"
                onClick={() => onConvertPhase!(phaseId)}
                className="shrink-0 text-zinc-400 hover:text-cyan-500 transition-colors p-0.5"
                title={t("projects.convertToSubproject")}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </button>
            ) : null}
          </div>
          <div className={`${timelineClass} relative`} style={{ ...timelineStyle, height: "100%" }}>
            {phaseBar && phase && (() => {
              const display = getPhaseBarDays(phase.id, phaseBar);
              const isPreview = dragPreview?.kind === "phase" && dragPreview.id === phase.id;
              return renderBar(
                display.startDay,
                display.endDay,
                phaseColor,
                0.85,
                "top-[8px] h-[20px]",
                phaseName,
                "phase",
                phase.id,
                phase.startDate,
                phase.endDate,
                !!phaseInteractive,
                isPreview,
              );
            })()}
          </div>
        </div>

        {isExport ? (
          <div>{taskList}</div>
        ) : (
          <SortablePhaseContainer id={phaseId} items={phaseTasks.map((td) => td.id)}>
            {taskList}
          </SortablePhaseContainer>
        )}
      </div>
    );
  };

  const headerBorder = isExport ? "border-zinc-200" : "border-zinc-200 dark:border-slate-700";
  const headerBg = isExport ? "bg-white" : "bg-white dark:bg-slate-900";
  const monthText = isExport ? "text-zinc-500" : "text-zinc-500 dark:text-slate-400";
  const monthBorder = isExport ? "border-zinc-100" : "border-zinc-100 dark:border-slate-800";

  const weekLabelText = isExport ? "text-zinc-400" : "text-zinc-400 dark:text-slate-500";

  return (
    <div className="relative" style={{ width: totalWidth, minWidth: totalWidth }}>
      {todayOffset >= 0 && todayOffset <= totalDays && (
        <div
          className={`absolute w-[2px] z-20 pointer-events-none ${isExport ? "bg-red-400" : "bg-red-400 dark:bg-red-500"}`}
          style={{
            left: labelW + todayOffset * COL_W + COL_W / 2,
            top: HEADER_TOTAL_H,
            bottom: 28,
          }}
        />
      )}

      <div
        className="absolute z-0 pointer-events-none overflow-hidden"
        style={{ left: labelW, top: HEADER_TOTAL_H, bottom: 28, width: chartWidth }}
      >
        <GanttTimelineGrid
          chartWidth={chartWidth}
          totalDays={totalDays}
          months={months}
          weekLineDays={weekLineDays}
          dragPreview={dragPreview}
          isExport={isExport}
        />
      </div>

      <div className={`flex border-b ${headerBorder} ${headerBg} z-10`} style={{ height: HEADER_TOTAL_H }}>
        <div className="shrink-0 border-b border-r border-transparent" style={{ width: labelW }} />
        <div className={`${timelineClass} relative`} style={{ ...timelineStyle, height: HEADER_TOTAL_H }}>
          <div className="absolute top-0 left-0 right-0 border-b border-zinc-100 dark:border-slate-800" style={{ height: HEADER_MONTH_H }}>
            {months.map((m, i) => (
              <div
                key={i}
                className={`absolute top-0 bottom-0 flex items-center text-[10px] font-semibold ${monthText} px-1 border-r ${monthBorder} uppercase tracking-wider overflow-hidden whitespace-nowrap`}
                style={{ left: m.leftPx, width: m.widthPx }}
              >
                {m.widthPx > 50 ? `${m.label} ${m.year}` : m.widthPx > 30 ? m.label.slice(0, 3) : ""}
              </div>
            ))}
          </div>
          <div className="absolute left-0 right-0" style={{ top: HEADER_MONTH_H, height: HEADER_WEEK_H }}>
            {weekTicks.map((tick) => (
              <div
                key={tick.dayIndex}
                className={`absolute top-0 bottom-0 flex items-center justify-center text-[9px] font-medium ${weekLabelText}`}
                style={{ left: tick.dayIndex * COL_W, width: COL_W }}
                title={String(tick.label)}
              >
                {tick.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {chronoPhases.map((phase) =>
        renderPhaseSection(phase.id, phase.name, phase.color, phaseBarData.get(phase.id) ?? null, phase),
      )}

      {(tasksByPhase.get("__none__") ?? []).length > 0 &&
        renderPhaseSection("__none__", t("phase.unassigned"), "#94a3b8", null)}

      <div className="flex items-center gap-1 mt-2 px-3">
        <div className="w-3 h-0.5 bg-red-400" />
        <span className={`text-[10px] ${isExport ? "text-zinc-400" : "text-zinc-400 dark:text-slate-500"}`}>{t("gantt.today")}</span>
      </div>
    </div>
  );
}

export default function GanttChart({
  phases,
  tasks,
  t,
  locale,
  variant = "interactive",
  onMoveTask,
  onTaskClick,
  onPhaseClick,
  onBarDateMove,
  onPhaseDateChange,
  canConvertPhaseToSubproject,
  onConvertPhase,
}: GanttChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const isExport = variant === "export";

  const parentTasks = useMemo(() => tasks.filter((td) => !td.parentId), [tasks]);
  const hasData = parentTasks.length > 0;

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
    const chronoSort = sortTasksByOrder;
    for (const [, list] of map) list.sort(chronoSort);
    unassigned.sort(chronoSort);
    map.set("__none__", unassigned);
    return map;
  }, [phases, parentTasks]);

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

  if (!hasData) {
    return (
      <div className={`text-center py-12 text-sm italic ${isExport ? "text-zinc-400 bg-white" : "text-zinc-400 dark:text-slate-500"}`}>
        {t("gantt.noData")}
      </div>
    );
  }

  const body = (
    <GanttChartBody
      phases={phases}
      tasks={tasks}
      t={t}
      locale={locale}
      isExport={isExport}
      onTaskClick={onTaskClick}
      onPhaseClick={onPhaseClick}
      onBarDateMove={onBarDateMove}
      onPhaseDateChange={onPhaseDateChange}
      canConvertPhaseToSubproject={canConvertPhaseToSubproject}
      onConvertPhase={onConvertPhase}
    />
  );

  if (isExport) {
    return <div className="overflow-visible bg-white">{body}</div>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="overflow-x-auto" ref={containerRef}>
        {body}
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

export function hasGanttExportData(tasks: Todo[]): boolean {
  return tasks.some((td) => !td.parentId);
}
