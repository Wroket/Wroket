"use client";

import { useMemo } from "react";

import type { ProjectPhase } from "@/lib/api";
import type { SharedProjectTaskRow } from "@/lib/api/projectShare";
import { PRIORITY_BADGES } from "@/lib/todoConstants";
import type { TranslationKey } from "@/lib/i18n";

interface Props {
  phases: ProjectPhase[];
  tasks: SharedProjectTaskRow[];
  t: (key: TranslationKey) => string;
}

export default function SharedKanbanView({ phases, tasks, t }: Props) {
  const orderedPhases = useMemo(
    () => [...phases].sort((a, b) => a.order - b.order),
    [phases],
  );

  const kanbanPhases =
    orderedPhases.length > 0
      ? orderedPhases
      : [
          {
            id: "__none__",
            name: t("phase.unassigned"),
            color: "#94a3b8",
            order: 0,
            projectId: "",
            startDate: null,
            endDate: null,
            createdAt: "",
          } as ProjectPhase,
        ];

  const validPhaseIds = new Set(orderedPhases.map((p) => p.id));
  const unassigned = tasks.filter((td) => !td.phaseId || !validPhaseIds.has(td.phaseId));

  return (
    <div className="overflow-x-auto pb-4 -mx-1 px-1">
      <div className="flex flex-col md:flex-row md:flex-nowrap gap-4">
        {kanbanPhases.map((phase) => {
          const isReal = phase.id !== "__none__";
          const phaseTasks = isReal
            ? tasks.filter((td) => td.phaseId === phase.id)
            : unassigned;
          const active = phaseTasks.filter((td) => td.status === "active");
          const completed = phaseTasks.filter((td) => td.status === "completed");
          const other = phaseTasks.filter(
            (td) => td.status !== "active" && td.status !== "completed",
          );

          return (
            <div
              key={phase.id}
              className="flex flex-col w-full md:w-[272px] md:shrink-0 rounded-lg border border-zinc-200 dark:border-slate-700 bg-zinc-50/80 dark:bg-slate-900/50 min-h-[200px]"
            >
              <div className="px-3 py-2.5 border-b border-zinc-200 dark:border-slate-700 flex items-center gap-2 shrink-0">
                <span
                  className="w-3 h-3 rounded-sm shrink-0"
                  style={{ backgroundColor: phase.color }}
                />
                <span className="text-sm font-semibold text-zinc-700 dark:text-slate-200 truncate flex-1">
                  {phase.name}
                </span>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-zinc-200 dark:bg-slate-700 text-zinc-600 dark:text-slate-400">
                  {phaseTasks.length}
                </span>
              </div>
              <div className="p-2 space-y-2 flex-1">
                {phaseTasks.length === 0 && (
                  <p className="text-xs text-zinc-400 dark:text-slate-500 italic text-center py-4">
                    {t("phase.empty")}
                  </p>
                )}
                {[...active, ...other, ...completed].map((task) => (
                  <KanbanCard key={task.id} task={task} t={t} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KanbanCard({
  task,
  t,
}: {
  task: SharedProjectTaskRow;
  t: (key: TranslationKey) => string;
}) {
  const priorityCls =
    PRIORITY_BADGES[task.priority as keyof typeof PRIORITY_BADGES]?.cls
    ?? PRIORITY_BADGES.medium.cls;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-2.5 shadow-sm">
      <div className="flex items-start gap-2">
        {task.isBlocked && (
          <span className="text-amber-500 shrink-0" title={t("dependencies.blockedBadge")}>
            ⛔
          </span>
        )}
        <p
          className={`text-sm font-medium text-zinc-800 dark:text-slate-200 leading-snug flex-1 min-w-0 ${
            task.status === "completed" ? "line-through opacity-60" : ""
          }`}
        >
          {task.title}
        </p>
      </div>
      <div className="flex items-center gap-1 mt-2 flex-wrap">
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${priorityCls}`}>
          {t(`priority.${task.priority}` as TranslationKey)}
        </span>
        {task.deadline && (
          <span className="text-[9px] font-medium text-zinc-400 dark:text-slate-500">
            {task.deadline}
          </span>
        )}
      </div>
    </div>
  );
}
