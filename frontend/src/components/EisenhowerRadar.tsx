"use client";

import { useState } from "react";
import type { Todo, Priority } from "@/lib/api";
import { classify } from "@/lib/classify";
import { deadlineLabel } from "@/lib/deadlineUtils";
import { EFFORT_BADGES } from "@/lib/effortBadges";
import { useLocale } from "@/lib/LocaleContext";
import { PRIORITY_BADGES, SUBTASK_BADGE_CLS, type Quadrant } from "@/lib/todoConstants";
import type { TranslationKey } from "@/lib/i18n";

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

function seededRandom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  return ((h & 0x7fffffff) % 1000) / 1000;
}

function urgencyScore(todo: Todo): number {
  const q = classify(todo);
  const isUrgent = q === "do-first" || q === "delegate";
  const jitter = seededRandom(todo.id + "x") * 15;

  if (isUrgent) {
    if (!todo.deadline) return 60 + jitter;
    const days = (new Date(todo.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (days < 0) return 78 + jitter * 0.6;
    if (days <= 1) return 72 + jitter * 0.8;
    if (days <= 3) return 65 + jitter;
    return 58 + jitter;
  }

  if (!todo.deadline) return 15 + jitter;
  const days = (new Date(todo.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (days <= 7) return 30 + jitter;
  if (days <= 14) return 22 + jitter;
  return 12 + jitter;
}

function importanceScore(todo: Todo): number {
  const q = classify(todo);
  const isImportant = q === "do-first" || q === "schedule";
  const jitter = seededRandom(todo.id + "y") * 12;

  const priorityBonus: Record<Priority, number> = { high: 18, medium: 8, low: 0 };
  const bonus = priorityBonus[todo.priority];

  if (isImportant) return 58 + bonus + jitter;
  return 12 + bonus + jitter;
}

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
}

export default function EisenhowerRadar({ todos, subtaskCounts = {}, meUid, userDisplayName, compact }: Props) {
  const { t } = useLocale();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div className={compact ? "max-w-full mx-auto" : "max-w-[calc(100vh-16rem)] mx-auto"}>
      {/* Column headers */}
      <div className="grid grid-cols-[auto_1fr_1fr] gap-x-2 mb-2">
        <div className="w-10" />
        <div className="text-center py-2 bg-zinc-50/50 dark:bg-slate-800/50 rounded">
          <span className={`font-bold tracking-[0.15em] uppercase text-blue-500 ${compact ? "text-[9px]" : "text-xs"}`}>
            🕐 {t("matrix.notUrgent")}
          </span>
        </div>
        <div className="text-center py-2 bg-zinc-50/50 dark:bg-slate-800/50 rounded">
          <span className={`font-bold tracking-[0.15em] uppercase text-amber-600 ${compact ? "text-[9px]" : "text-xs"}`}>
            ⚡ {t("matrix.urgent")}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-x-2">
        {/* Y-axis */}
        <div className="w-10 flex flex-col gap-y-px bg-zinc-50/50 dark:bg-slate-800/50 rounded">
          <div className="flex-1 flex items-center justify-center">
            <span className={`[writing-mode:vertical-lr] rotate-180 font-bold tracking-[0.15em] uppercase text-red-500 ${compact ? "text-[9px]" : "text-xs"}`}>
              {t("matrix.important")}
            </span>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <span className={`[writing-mode:vertical-lr] rotate-180 font-bold tracking-[0.15em] uppercase text-zinc-400 ${compact ? "text-[9px]" : "text-xs"}`}>
              {t("matrix.notImportant")}
            </span>
          </div>
        </div>

        {/* Plot area */}
        <div className="relative overflow-visible aspect-square border border-zinc-200 dark:border-slate-600 rounded">
          <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px bg-zinc-200 dark:bg-slate-600 rounded overflow-hidden">
            <div className="bg-zinc-100/80 dark:bg-slate-800/60" />
            <div className="bg-zinc-100/80 dark:bg-slate-800/60" />
            <div className="bg-zinc-100/80 dark:bg-slate-800/60" />
            <div className="bg-zinc-100/80 dark:bg-slate-800/60" />
          </div>

          <span className={`absolute top-3 left-3 font-bold text-blue-400/60 uppercase tracking-wide ${compact ? "text-[8px]" : "text-[10px]"}`}>{t("badge.schedule")}</span>
          <span className={`absolute top-3 right-3 font-bold text-red-400/60 uppercase tracking-wide ${compact ? "text-[8px]" : "text-[10px]"}`}>{t("badge.doFirst")}</span>
          <span className={`absolute bottom-3 left-3 font-bold text-zinc-400/60 uppercase tracking-wide ${compact ? "text-[8px]" : "text-[10px]"}`}>{t("badge.eliminate")}</span>
          <span className={`absolute bottom-3 right-3 font-bold text-amber-400/60 uppercase tracking-wide ${compact ? "text-[8px]" : "text-[10px]"}`}>{t("badge.delegate")}</span>

          {todos.map((todo) => {
            const x = urgencyScore(todo);
            const y = importanceScore(todo);
            const q = classify(todo);
            const isHovered = hoveredId === todo.id;
            const badge = PRIORITY_BADGES[todo.priority];
            const dl = todo.deadline ? deadlineLabel(todo.deadline, t) : null;
            const dotSize = compact ? 10 : 14;

            return (
              <div
                key={todo.id}
                className={`absolute ${isHovered ? "z-50" : "z-10"}`}
                style={{
                  left: `${x}%`,
                  bottom: `${y}%`,
                  transform: "translate(-50%, 50%)",
                }}
                onMouseEnter={() => setHoveredId(todo.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <div
                  className={`rounded-full border-2 border-white shadow-md cursor-pointer transition-transform ${DOT_COLORS[q]} ${
                    isHovered ? "scale-150 ring-2 ring-offset-1 ring-zinc-400" : "hover:scale-125"
                  }`}
                  style={{ width: dotSize, height: dotSize }}
                />

                {isHovered && (
                  <Tooltip x={x} y={y} todo={todo} badge={badge} quadrant={q} dl={dl} subtaskCount={subtaskCounts[todo.id] ?? 0} meUid={meUid} userDisplayName={userDisplayName} />
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
  x, y, todo, badge, quadrant, dl, subtaskCount = 0, meUid, userDisplayName,
}: {
  x: number; y: number; todo: Todo;
  badge: { label: string; tKey: TranslationKey; cls: string };
  quadrant: Quadrant;
  dl: { text: string; cls: string } | null;
  subtaskCount?: number; meUid?: string | null; userDisplayName?: (uid: string) => string;
}) {
  const { t } = useLocale();
  const showBelow = y > 75;
  const alignRight = x > 75;
  const alignLeft = x < 25;

  const verticalStyle: React.CSSProperties = showBelow
    ? { top: "calc(100% + 10px)" }
    : { bottom: "calc(100% + 10px)" };

  const horizontalStyle: React.CSSProperties = alignRight
    ? { right: -8 }
    : alignLeft
      ? { left: -8 }
      : { left: "50%", transform: "translateX(-50%)" };

  const arrowPosition = alignRight ? "right-3" : alignLeft ? "left-3" : "left-1/2 -translate-x-1/2";

  return (
    <div
      className="absolute z-50 bg-slate-700 dark:bg-slate-100 text-white dark:text-slate-900 rounded shadow-xl px-4 py-3 text-xs w-56 pointer-events-none"
      style={{ ...verticalStyle, ...horizontalStyle }}
    >
      <p className="font-semibold text-sm mb-1.5">{todo.title}</p>
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
      <div
        className={`absolute ${arrowPosition} w-0 h-0 ${showBelow ? "bottom-full" : "top-full"}`}
        style={{
          borderLeft: "6px solid transparent",
          borderRight: "6px solid transparent",
          ...(showBelow
            ? { borderBottom: "6px solid rgb(24 24 27)" }
            : { borderTop: "6px solid rgb(24 24 27)" }),
        }}
      />
    </div>
  );
}
