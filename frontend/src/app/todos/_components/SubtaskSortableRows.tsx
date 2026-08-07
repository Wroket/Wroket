"use client";

import { arrayMove } from "@dnd-kit/sortable";

import { displayTodoTitle } from "@/lib/todoDisplay";
import { deadlineLabel } from "@/lib/deadlineUtils";
import { EFFORT_BADGES } from "@/lib/effortBadges";
import { useLocale } from "@/lib/LocaleContext";
import { PRIORITY_BADGES } from "@/lib/todoConstants";
import { classify } from "@/lib/classify";
import type { Effort, Priority, Project, Todo } from "@/lib/api";
import type { TaskEditZone } from "@/components/TaskEditModal";
import Menu from "@/components/ui/Menu";
import TaskIconToolbar from "@/components/TaskIconToolbar";
import TaskRowActionsV2 from "@/components/v2/TaskRowActionsV2";
import { toolbarCompleteButton } from "@/components/taskToolbarStyles";
import { useUiV2 } from "@/lib/UiVersionContext";
import { QUADRANT_BADGES } from "./sortUtils";
import {
  DEFAULT_TASK_LIST_COLUMNS,
  taskListMetaTag,
  type TaskListColumnId,
} from "./taskListColumns";
import type { TaskListActionId } from "@/lib/taskListVisibleActions";

export interface SubtaskSortableRowsProps {
  subs: Todo[];
  meUid: string | null;
  /** Shared clock with parent row / radar for quadrant badges. */
  nowMs?: number;
  onComplete: (t: Todo) => void;
  onCancel: (t: Todo) => void;
  onDelete: (t: Todo) => void;
  onEdit: (t: Todo, zone?: TaskEditZone) => void;
  onPriorityChange?: (t: Todo, priority: Priority) => void;
  onEffortChange?: (t: Todo, effort: Effort) => void;
  onDecline: (t: Todo) => void;
  onAccept: (t: Todo) => void;
  onScheduleUpdate?: (todo: Todo) => void;
  onMeet?: (todo: Todo) => void;
  meetLoadingId?: string | null;
  onCreateNote?: (todo: Todo) => void;
  hasLinkedNoteById?: Record<string, boolean>;
  commentCounts?: Record<string, number>;
  attachmentCounts?: Record<string, number>;
  projects?: Project[];
  onReorderSubtasks?: (orderedIds: string[]) => void;
  columnOrder?: TaskListColumnId[];
  visibleActions?: TaskListActionId[];
}

export default function SubtaskSortableRows({
  subs,
  meUid,
  nowMs,
  onComplete,
  onCancel,
  onDelete,
  onEdit,
  onPriorityChange,
  onEffortChange,
  onDecline,
  onAccept,
  onScheduleUpdate,
  onMeet,
  meetLoadingId,
  onCreateNote,
  hasLinkedNoteById = {},
  commentCounts = {},
  attachmentCounts = {},
  projects = [],
  onReorderSubtasks,
  columnOrder = DEFAULT_TASK_LIST_COLUMNS,
  visibleActions,
}: SubtaskSortableRowsProps) {
  const { t } = useLocale();
  const { uiV2 } = useUiV2();
  const metaTag = taskListMetaTag(uiV2);

  const moveSubtask = (index: number, direction: -1 | 1) => {
    if (!onReorderSubtasks) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= subs.length) return;
    const reordered = arrayMove(subs, index, newIndex);
    onReorderSubtasks(reordered.map((s) => s.id));
  };

  return (
    <>
      {subs.map((sub, idx) => {
        const subBadge = PRIORITY_BADGES[sub.priority];
        const subDl = sub.deadline ? deadlineLabel(sub.deadline, t) : null;
        const qBadge = QUADRANT_BADGES[classify(sub, nowMs)];

        const renderCell = (col: TaskListColumnId) => {
          switch (col) {
            case "actions":
              return (
                <td
                  key={col}
                  className={`py-2 pl-8 pr-0.5 align-top ${uiV2 ? "task-list-col-actions" : ""}`}
                >
                  {uiV2 ? (
                    <TaskRowActionsV2
                      todo={sub}
                      meUid={meUid}
                      projects={projects}
                      commentCount={commentCounts[sub.id] ?? 0}
                      subtaskCount={0}
                      attachmentCount={attachmentCounts[sub.id] ?? 0}
                      onComplete={onComplete}
                      onSubtask={() => {}}
                      onScheduleUpdate={onScheduleUpdate}
                      onMeet={onMeet}
                      meetLoading={meetLoadingId === sub.id}
                      onCancel={onCancel}
                      onDecline={onDecline}
                      onAccept={onAccept}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onCreateNote={onCreateNote}
                      hasLinkedNote={!!hasLinkedNoteById[sub.id]}
                      suggestedSlot={sub.suggestedSlot}
                      hideCompleteButton
                      visibleActions={visibleActions}
                    />
                  ) : (
                    <TaskIconToolbar
                      todo={sub}
                      meUid={meUid}
                      projects={projects}
                      commentCount={commentCounts[sub.id] ?? 0}
                      subtaskCount={0}
                      attachmentCount={attachmentCounts[sub.id] ?? 0}
                      onComplete={onComplete}
                      onSubtask={() => {}}
                      onScheduleUpdate={onScheduleUpdate}
                      onMeet={onMeet}
                      meetLoading={meetLoadingId === sub.id}
                      onCancel={onCancel}
                      onDecline={onDecline}
                      onAccept={onAccept}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onCreateNote={onCreateNote}
                      hasLinkedNote={!!hasLinkedNoteById[sub.id]}
                      isolatePointerEvents
                    />
                  )}
                </td>
              );
            case "title": {
              const subTitle = displayTodoTitle(sub.title, t("todos.untitled"));
              return (
                <td
                  key={col}
                  className={`pl-2 pr-4 py-2 ${uiV2 ? "task-list-col-title" : ""}`}
                >
                  <div className={uiV2 ? "flex min-w-0 items-center gap-1.5" : undefined}>
                    <span className={`text-zinc-400 ${uiV2 ? "shrink-0" : "mr-1.5"}`}>↳</span>
                    <span
                      className={`text-sm ${sub.status === "completed" ? "line-through text-zinc-400" : "text-zinc-700 dark:text-slate-300"}${uiV2 ? " min-w-0 truncate" : ""}`}
                      title={uiV2 ? subTitle : undefined}
                    >
                      {subTitle}
                    </span>
                  </div>
                </td>
              );
            }
            case "priority":
              return (
                <td
                  key={col}
                  className={`${uiV2 ? "px-4 task-list-col-meta" : "px-4 w-24"} py-2 align-top text-center`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {!onPriorityChange || sub.status !== "active" ? (
                    <span className={`${metaTag} ${subBadge.cls}`}>{t(subBadge.tKey)}</span>
                  ) : (
                    <Menu
                      className="w-full"
                      label={t("a11y.changePriority")}
                      trigger={t(subBadge.tKey)}
                      triggerProps={{
                        className: `${metaTag} transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-500 ${subBadge.cls}`,
                        title: t("a11y.changePriority"),
                      }}
                      items={(["high", "medium", "low"] as Priority[]).map((p) => ({
                        id: p,
                        label: sub.priority === p ? `✓ ${t(PRIORITY_BADGES[p].tKey)}` : t(PRIORITY_BADGES[p].tKey),
                        onSelect: () => onPriorityChange(sub, p),
                      }))}
                    />
                  )}
                </td>
              );
            case "effort": {
              const effort = sub.effort ?? "medium";
              const effortBadge = EFFORT_BADGES[effort];
              return (
                <td
                  key={col}
                  className={`${uiV2 ? "px-4 task-list-col-meta" : "px-4 w-24"} py-2 align-top text-center`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {!onEffortChange || sub.status !== "active" ? (
                    <span className={`${metaTag} ${effortBadge.cls}`}>{t(effortBadge.tKey)}</span>
                  ) : (
                    <Menu
                      className="w-full"
                      label={t("a11y.changeEffort")}
                      trigger={t(effortBadge.tKey)}
                      triggerProps={{
                        className: `${metaTag} transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-500 ${effortBadge.cls}`,
                        title: t("a11y.changeEffort"),
                      }}
                      items={(["light", "medium", "heavy"] as Effort[]).map((e) => ({
                        id: e,
                        label: effort === e ? `✓ ${t(EFFORT_BADGES[e].tKey)}` : t(EFFORT_BADGES[e].tKey),
                        onSelect: () => onEffortChange(sub, e),
                      }))}
                    />
                  )}
                </td>
              );
            }
            case "deadline":
              return (
                <td
                  key={col}
                  className={`${uiV2 ? "px-4 task-list-col-meta" : "px-4 w-24"} py-2 align-top text-center cursor-pointer`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(sub, "planning");
                  }}
                >
                  {subDl ? (
                    <span className={`${metaTag} hover:opacity-80 transition-opacity ${subDl.cls}`}>{subDl.text}</span>
                  ) : (
                    <span className={`${metaTag} text-zinc-300 dark:text-slate-600 hover:text-zinc-500 dark:hover:text-slate-400 transition-colors`}>—</span>
                  )}
                </td>
              );
            case "classification":
              return (
                <td
                  key={col}
                  className={`${uiV2 ? "px-4 task-list-col-meta" : "px-4 w-24"} py-2 align-top text-center`}
                >
                  <span className={`${metaTag} ${qBadge.cls}`}>
                    {t(qBadge.tKey)}
                  </span>
                </td>
              );
            default:
              return null;
          }
        };

        return (
          <tr
            key={sub.id}
            className={
              uiV2
                ? "task-list-row-card task-list-row-card--sub"
                : "border-b border-zinc-100 dark:border-slate-800 last:border-b-0 bg-zinc-50/40 dark:bg-slate-800/30"
            }
          >
            <td className="w-8 px-1 py-2 text-center">
              {onReorderSubtasks && subs.length > 1 && (
                <div className="flex flex-col items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => moveSubtask(idx, -1)}
                    disabled={idx === 0}
                    className="text-zinc-300 dark:text-slate-600 hover:text-zinc-500 dark:hover:text-slate-400 disabled:opacity-20 disabled:cursor-default transition-colors"
                    title={t("table.moveUp")}
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSubtask(idx, 1)}
                    disabled={idx === subs.length - 1}
                    className="text-zinc-300 dark:text-slate-600 hover:text-zinc-500 dark:hover:text-slate-400 disabled:opacity-20 disabled:cursor-default transition-colors"
                    title={t("table.moveDown")}
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              )}
            </td>
            {uiV2 && (
              <td className="w-9 px-0.5 py-2 align-middle text-center">
                {sub.status === "active" ? (
                  <button
                    type="button"
                    title={t("a11y.complete")}
                    aria-label={t("a11y.complete")}
                    onClick={(e) => { e.stopPropagation(); onComplete(sub); }}
                    className={toolbarCompleteButton}
                  >
                    <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                ) : null}
              </td>
            )}
            {columnOrder.map((col) => renderCell(col))}
            <td className={uiV2 ? "w-10 px-1 py-2" : "w-10 px-1 py-2 bg-zinc-50/40 dark:bg-slate-800/30"} aria-hidden />
          </tr>
        );
      })}
    </>
  );
}
