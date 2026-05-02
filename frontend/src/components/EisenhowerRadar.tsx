"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type CSSProperties } from "react";
import type { Todo } from "@/lib/api";
import { displayTodoTitle } from "@/lib/todoDisplay";
import {
  computeTaskScores,
  radarDotPlacement,
  radarDotRadiusPx,
  radarRingVisual,
  spreadRadarDots,
  type RadarMode,
  type TaskScores,
} from "@/lib/taskScores";
import { deadlineLabel } from "@/lib/deadlineUtils";
import { formatScheduledSlotLabel } from "@/lib/slotFormat";
import { EFFORT_BADGES } from "@/lib/effortBadges";
import { useLocale } from "@/lib/LocaleContext";
import { PRIORITY_BADGES, SUBTASK_BADGE_CLS, type Quadrant } from "@/lib/todoConstants";
import type { TranslationKey } from "@/lib/i18n";
import { trackRadarEvent } from "@/lib/productAnalytics";

const QUADRANT_BADGES: Record<Quadrant, { tKey: TranslationKey; cls: string }> = {
  "do-first": { tKey: "badge.doFirst", cls: "bg-red-500 text-white dark:bg-red-600" },
  schedule: { tKey: "badge.schedule", cls: "bg-blue-500 text-white dark:bg-blue-600" },
  delegate: { tKey: "badge.delegate", cls: "bg-amber-500 text-white dark:bg-amber-600" },
  eliminate: { tKey: "badge.eliminate", cls: "bg-emerald-400 text-white dark:bg-emerald-600" },
};

const DOT_COLORS: Record<Quadrant, string> = {
  "do-first": "bg-red-500",
  schedule: "bg-blue-500",
  delegate: "bg-amber-400",
  eliminate: "bg-zinc-400",
};

/** Lets the pointer cross the gap between the dot and the tooltip without closing it. */
const HOVER_TOOLTIP_LEAVE_MS = 220;

const RADAR_MODES: { id: RadarMode; labelKey: TranslationKey; helpKey: TranslationKey }[] = [
  { id: "eisenhower", labelKey: "matrix.radarModeEisenhower", helpKey: "matrix.radarModeEisenhowerDesc" },
  { id: "pressure", labelKey: "matrix.radarModePressure", helpKey: "matrix.radarModePressureDesc" },
  { id: "roi", labelKey: "matrix.radarModeRoi", helpKey: "matrix.radarModeRoiDesc" },
  { id: "load", labelKey: "matrix.radarModeLoad", helpKey: "matrix.radarModeLoadDesc" },
];

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

interface Props {
  todos: Todo[];
  subtaskCounts?: Record<string, number>;
  meUid?: string | null;
  userDisplayName?: (uid: string) => string;
  compact?: boolean;
  /** Si les deux sont fournis, le mode est contrôlé par le parent (ex. liste « Priorités » synchronisée). */
  radarMode?: RadarMode;
  onRadarModeChange?: (mode: RadarMode) => void;
  /** Horodatage partagé pour le score decay (fourni par un ticker 60s dans le parent). */
  nowMs?: number;
  /** When set, clicking the dot or the hover card opens edit (e.g. TaskEditModal) without navigating. */
  onEditTask?: (todo: Todo) => void;
}

export default function EisenhowerRadar({
  todos,
  subtaskCounts = {},
  meUid,
  userDisplayName,
  compact,
  radarMode: radarModeProp,
  onRadarModeChange,
  nowMs,
  onEditTask,
}: Props) {
  const { t } = useLocale();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hoverClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelHoverClear = useCallback(() => {
    if (hoverClearTimerRef.current) {
      clearTimeout(hoverClearTimerRef.current);
      hoverClearTimerRef.current = null;
    }
  }, []);
  const scheduleHoverClear = useCallback(() => {
    cancelHoverClear();
    hoverClearTimerRef.current = setTimeout(() => {
      hoverClearTimerRef.current = null;
      setHoveredId(null);
    }, HOVER_TOOLTIP_LEAVE_MS);
  }, [cancelHoverClear]);
  const pinHover = useCallback(
    (id: string) => {
      cancelHoverClear();
      setHoveredId(id);
    },
    [cancelHoverClear],
  );
  useEffect(
    () => () => {
      cancelHoverClear();
    },
    [cancelHoverClear],
  );
  const [internalRadarMode, setInternalRadarMode] = useState<RadarMode>("eisenhower");
  const isControlled = radarModeProp !== undefined && onRadarModeChange !== undefined;
  const radarMode = isControlled ? radarModeProp : internalRadarMode;
  const setRadarMode = (id: RadarMode) => {
    trackRadarEvent("radar_mode_change", { mode: id });
    onRadarModeChange?.(id);
    if (!isControlled) setInternalRadarMode(id);
  };

  const scoreById = useMemo(() => {
    // "Now" for scoring; when not controlled, wall-clock time is intentional for overdue / due-soon.
    const now = nowMs ?? Date.now(); // eslint-disable-line react-hooks/purity -- time-dependent layout
    const m = new Map<string, TaskScores>();
    for (const todo of todos) {
      m.set(todo.id, computeTaskScores(todo, now));
    }
    return m;
  }, [todos, nowMs]);

  /** Fan-out nearby dots inside the same quadrant cell for readability */
  const spreadById = useMemo(() => {
    const items = todos.map((todo) => {
      const scores = scoreById.get(todo.id)!;
      const p = radarDotPlacement(todo.id, scores, radarMode);
      return { id: todo.id, left: p.left, bottom: p.bottom, quadrant: scores.quadrant };
    });
    return spreadRadarDots(items);
  }, [todos, radarMode, scoreById]);

  /** Colonne 1 (gauche) = Important / charge forte ; colonne 2 (droite) = pas important / charge faible. */
  const xLabels = useMemo(() => {
    switch (radarMode) {
      case "load":
        return { left: t("matrix.axisLoadHigh"), right: t("matrix.axisLoadLow") };
      case "eisenhower":
      case "pressure":
      case "roi":
      default:
        return { left: t("matrix.important"), right: t("matrix.notImportant") };
    }
  }, [radarMode, t]);

  const yLabels = useMemo(() => {
    switch (radarMode) {
      case "load":
        return { top: t("matrix.urgent"), bottom: t("matrix.notUrgent") };
      case "pressure":
        return { top: t("matrix.axisHighX"), bottom: t("matrix.axisLowX") };
      case "roi":
        return { top: t("matrix.axisHighX"), bottom: t("matrix.axisLowX") };
      case "eisenhower":
      default:
        return { top: t("matrix.urgent"), bottom: t("matrix.notUrgent") };
    }
  }, [radarMode, t]);

  const openTaskEdit = (todo: Todo) => {
    trackRadarEvent("radar_open_edit", { todoId: todo.id });
    onEditTask?.(todo);
  };

  return (
    <div className={compact ? "max-w-full mx-auto" : "max-w-[min(100%,calc(100vh-16rem))] mx-auto"}>
      {!compact && (
        <p className="text-center text-xs text-zinc-500 dark:text-slate-400 mb-2 max-w-md mx-auto leading-relaxed">
          {t("matrix.radarLensIntro")}
        </p>
      )}
      <div className={`flex flex-wrap gap-1.5 justify-center mb-3 ${compact ? "gap-1" : ""}`}>
        {RADAR_MODES.map(({ id, labelKey, helpKey }) => (
          <button
            key={id}
            type="button"
            title={t(helpKey)}
            onClick={() => setRadarMode(id)}
            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${
              radarMode === id
                ? "bg-slate-700 text-white dark:bg-slate-600"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[auto_1fr_1fr] gap-x-2 mb-2">
        <div className="w-10 shrink-0" aria-hidden />
        <div className="text-center py-2 rounded-lg bg-zinc-50/50 dark:bg-slate-800/50 border border-zinc-200/80 dark:border-slate-600/50">
          <span className={`font-bold tracking-[0.12em] uppercase text-red-500 ${compact ? "text-[9px]" : "text-xs"}`}>
            {xLabels.left}
          </span>
        </div>
        <div className="text-center py-2 rounded-lg bg-zinc-50/50 dark:bg-slate-800/50 border border-zinc-200/80 dark:border-slate-600/50">
          <span className={`font-bold tracking-[0.12em] uppercase text-zinc-500 dark:text-slate-400 ${compact ? "text-[9px]" : "text-xs"}`}>
            {xLabels.right}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-x-2 items-stretch">
        <div className="flex flex-col gap-2 w-11 shrink-0 min-h-0 self-stretch">
          <div className="flex-1 flex min-h-0 items-center justify-center rounded-lg bg-zinc-50/50 dark:bg-slate-800/50 border border-zinc-200/80 dark:border-slate-600/50 px-1 py-2">
            <span className={`[writing-mode:vertical-lr] rotate-180 font-bold tracking-[0.12em] uppercase text-amber-600 ${compact ? "text-[9px]" : "text-xs"}`}>
              {yLabels.top}
            </span>
          </div>
          <div className="flex-1 flex min-h-0 items-center justify-center rounded-lg bg-zinc-50/50 dark:bg-slate-800/50 border border-zinc-200/80 dark:border-slate-600/50 px-1 py-2">
            <span className={`[writing-mode:vertical-lr] rotate-180 font-bold tracking-[0.12em] uppercase text-blue-500 ${compact ? "text-[9px]" : "text-xs"}`}>
              {yLabels.bottom}
            </span>
          </div>
        </div>

        <div className="relative overflow-visible aspect-square min-w-0 border border-zinc-200 dark:border-slate-600 rounded-lg">
          <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px bg-zinc-200 dark:bg-slate-600 rounded overflow-hidden">
            <div className="bg-zinc-100/80 dark:bg-slate-800/60" />
            <div className="bg-zinc-100/80 dark:bg-slate-800/60" />
            <div className="bg-zinc-100/80 dark:bg-slate-800/60" />
            <div className="bg-zinc-100/80 dark:bg-slate-800/60" />
          </div>

          <span className={`absolute top-3 left-3 font-bold text-red-400/60 uppercase tracking-wide ${compact ? "text-[8px]" : "text-[10px]"}`}>{t("quadrant.doFirst")}</span>
          <span className={`absolute top-3 right-3 font-bold text-amber-400/60 uppercase tracking-wide ${compact ? "text-[8px]" : "text-[10px]"}`}>{t("quadrant.delegate")}</span>
          <span className={`absolute bottom-3 left-3 font-bold text-blue-400/60 uppercase tracking-wide ${compact ? "text-[8px]" : "text-[10px]"}`}>{t("quadrant.schedule")}</span>
          <span className={`absolute bottom-3 right-3 font-bold text-zinc-400/60 uppercase tracking-wide ${compact ? "text-[8px]" : "text-[10px]"}`}>{t("quadrant.eliminate")}</span>

          {todos.map((todo) => {
            const scores = scoreById.get(todo.id) ?? computeTaskScores(todo);
            const base = radarDotPlacement(todo.id, scores, radarMode);
            const spread = spreadById.get(todo.id) ?? base;
            const x = spread.left;
            const y = spread.bottom;
            const q = scores.quadrant;
            const isHovered = hoveredId === todo.id;
            const badge = PRIORITY_BADGES[todo.priority];
            const dl = todo.deadline ? deadlineLabel(todo.deadline, t) : null;
            const bookingLabel = todo.scheduledSlot ? formatScheduledSlotLabel(todo.scheduledSlot) : null;
            const dotR = radarDotRadiusPx(scores.C, !!compact);
            const ring = radarRingVisual(scores, q);
            const ringR = dotR + ring.ringPaddingPx;
            /** Integer px avoids subpixel mismatch between SVG and dot; halo + dot share one centering transform. */
            const boxSize = Math.round(ringR * 2 + 2);
            const cx = boxSize / 2;
            const cy = boxSize / 2;

            return (
              <div
                key={todo.id}
                className={`absolute ${isHovered ? "z-50" : "z-10"}`}
                style={{
                  left: `${x}%`,
                  bottom: `${y}%`,
                  transform: "translate(-50%, 50%)",
                }}
                onMouseEnter={() => pinHover(todo.id)}
                onMouseLeave={scheduleHoverClear}
                onFocus={() => pinHover(todo.id)}
                onBlur={scheduleHoverClear}
              >
                <div
                  className="relative"
                  style={{
                    width: boxSize,
                    height: boxSize,
                  }}
                >
                  {/* Same center anchor for ring + dot (flex + inset-0 SVG can drift by subpixels vs inline SVG baseline). */}
                  <div
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none overflow-visible"
                    style={{ width: boxSize, height: boxSize, filter: ring.dropShadow }}
                  >
                    <svg
                      className="block size-full"
                      width={boxSize}
                      height={boxSize}
                      viewBox={`0 0 ${boxSize} ${boxSize}`}
                      aria-hidden
                      style={{ overflow: "visible" }}
                    >
                      <circle
                        cx={cx}
                        cy={cy}
                        r={ringR}
                        fill="none"
                        stroke={ring.stroke}
                        strokeWidth={ring.strokeWidth}
                        opacity={ring.opacity}
                        shapeRendering="geometricPrecision"
                      />
                    </svg>
                  </div>
                  <div
                    tabIndex={0}
                    role="button"
                    aria-label={displayTodoTitle(todo.title, t("todos.untitled"))}
                    className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full cursor-pointer transition-[transform,outline] outline-none ${DOT_COLORS[q]} ${
                      isHovered
                        ? "scale-150 z-10 outline outline-2 outline-zinc-400 dark:outline-zinc-500 outline-offset-[3px]"
                        : "hover:scale-125"
                    } focus-visible:z-10 focus-visible:scale-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-400 dark:focus-visible:outline-zinc-500 focus-visible:outline-offset-[3px]`}
                    style={{ width: dotR * 2, height: dotR * 2 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onEditTask) {
                        cancelHoverClear();
                        setHoveredId(null);
                        openTaskEdit(todo);
                      }
                    }}
                    onKeyDown={(e: KeyboardEvent) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (onEditTask) {
                          cancelHoverClear();
                          setHoveredId(null);
                          openTaskEdit(todo);
                        }
                      }
                    }}
                  />
                </div>

                {isHovered && (
                  <Tooltip
                    x={x}
                    y={y}
                    todo={todo}
                    badge={badge}
                    quadrant={q}
                    dl={dl}
                    bookingLabel={bookingLabel}
                    subtaskCount={subtaskCounts[todo.id] ?? 0}
                    meUid={meUid}
                    userDisplayName={userDisplayName}
                    t={t}
                    onMouseEnter={() => pinHover(todo.id)}
                    onMouseLeave={scheduleHoverClear}
                    onEditTaskClick={
                      onEditTask
                        ? () => {
                            cancelHoverClear();
                            setHoveredId(null);
                            openTaskEdit(todo);
                          }
                        : undefined
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Tooltip({
  x,
  y,
  todo,
  badge,
  quadrant,
  dl,
  bookingLabel,
  subtaskCount = 0,
  meUid,
  userDisplayName,
  t,
  onMouseEnter,
  onMouseLeave,
  onEditTaskClick,
}: {
  x: number;
  y: number;
  todo: Todo;
  badge: { label: string; tKey: TranslationKey; cls: string };
  quadrant: Quadrant;
  dl: { text: string; cls: string } | null;
  bookingLabel: string | null;
  subtaskCount?: number;
  meUid?: string | null;
  userDisplayName?: (uid: string) => string;
  t: (key: TranslationKey) => string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onEditTaskClick?: () => void;
}) {
  const showBelow = y > 75;
  const alignRight = x > 75;
  const alignLeft = x < 25;

  const verticalStyle: CSSProperties = showBelow
    ? { top: "calc(100% + 10px)" }
    : { bottom: "calc(100% + 10px)" };

  const horizontalStyle: CSSProperties = alignRight
    ? { right: -8 }
    : alignLeft
      ? { left: -8 }
      : { left: "50%", transform: "translateX(-50%)" };

  const arrowPosition = alignRight ? "right-3" : alignLeft ? "left-3" : "left-1/2 -translate-x-1/2";

  const stopBubble = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
  };

  const interactive = !!onEditTaskClick;

  return (
    <div
      role={interactive ? "button" : "tooltip"}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? t("matrix.radarClickToEdit") : undefined}
      title={interactive ? t("matrix.radarClickToEdit") : undefined}
      className={`absolute z-50 bg-slate-700 dark:bg-slate-600 text-white dark:text-slate-100 rounded shadow-xl px-4 py-3 text-xs w-56 pointer-events-auto select-text radar-tooltip ${
        interactive ? "cursor-pointer hover:bg-slate-600 dark:hover:bg-slate-500/90" : "cursor-default"
      }`}
      style={{ ...verticalStyle, ...horizontalStyle }}
      onPointerDown={stopBubble}
      onMouseDown={stopBubble}
      onClick={(e) => {
        stopBubble(e);
        onEditTaskClick?.();
      }}
      onKeyDown={
        interactive
          ? (e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onEditTaskClick?.();
              }
            }
          : undefined
      }
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <p className="font-semibold text-sm mb-1.5">{displayTodoTitle(todo.title, t("todos.untitled"))}</p>
      <div className="flex flex-wrap items-center gap-1.5 mb-1">
        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${badge.cls}`}>{t(badge.tKey)}</span>
        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${EFFORT_BADGES[todo.effort ?? "medium"].cls}`}>{t(EFFORT_BADGES[todo.effort ?? "medium"].tKey)}</span>
        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${QUADRANT_BADGES[quadrant].cls}`}>{t(QUADRANT_BADGES[quadrant].tKey)}</span>
        {dl && <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${dl.cls}`}>{dl.text}</span>}
        {subtaskCount > 0 && <SubtaskBadge count={subtaskCount} />}
        {todo.assignedTo && meUid && todo.assignedTo === meUid && todo.userId !== meUid && userDisplayName && (
          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
            {userDisplayName(todo.userId)}
          </span>
        )}
        {todo.assignedTo && meUid && todo.assignedTo !== meUid && userDisplayName && (
          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300">
            → {userDisplayName(todo.assignedTo)}
          </span>
        )}
      </div>
      {bookingLabel && bookingLabel !== "—" && (
        <p className="mt-2 pt-2 border-t border-white/15 text-[11px] text-slate-100/95 leading-snug">
          <span className="font-medium text-slate-200">{t("schedule.booked")}:</span>{" "}
          <span className="whitespace-nowrap">
            {"\uD83D\uDCC5 "}
            {bookingLabel}
          </span>
        </p>
      )}
      <div
        className={`absolute ${arrowPosition} w-0 h-0 ${showBelow ? "bottom-full" : "top-full"}`}
        style={{
          borderLeft: "6px solid transparent",
          borderRight: "6px solid transparent",
          ...(showBelow
            ? { borderBottom: "6px solid rgb(51 65 85)" }
            : { borderTop: "6px solid rgb(51 65 85)" }),
        }}
      />
    </div>
  );
}
