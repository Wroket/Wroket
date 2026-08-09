"use client";

import { cloneElement, isValidElement, type CSSProperties, type ReactElement } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { ScheduledSlotBadge } from "@/components/SlotPicker";
import Menu from "@/components/ui/Menu";
import { displayTodoTitle } from "@/lib/todoDisplay";
import { classify } from "@/lib/classify";
import { deadlineLabel } from "@/lib/deadlineUtils";
import { EFFORT_BADGES } from "@/lib/effortBadges";
import { useLocale } from "@/lib/LocaleContext";
import { PRIORITY_BADGES, SUBTASK_BADGE_CLS } from "@/lib/todoConstants";
import type { Todo, Project, Priority, Effort } from "@/lib/api";
import type { TaskEditZone } from "@/components/TaskEditModal";
import { toolbarCompleteButton } from "@/components/taskToolbarStyles";

import { QUADRANT_BADGES } from "./sortUtils";
import TaskRowActionsV2 from "@/components/v2/TaskRowActionsV2";
import AssignmentStatusBadge from "@/components/AssignmentStatusBadge";
import { useUiV2 } from "@/lib/UiVersionContext";
import SubtaskSortableRows from "./SubtaskSortableRows";
import {
  DEFAULT_TASK_LIST_COLUMNS,
  taskListMetaTag,
  type TaskListColumnId,
} from "./taskListColumns";
import type { TaskListActionId } from "@/lib/taskListVisibleActions";

export interface SortableTaskRowProps {
  todo: Todo;
  /** Horodatage partagé avec le radar pour le badge de quadrant. */
  nowMs?: number;
  isArchived: boolean;
  meUid: string | null;
  userDisplayName: (uid: string) => string;
  onComplete: (t: Todo) => void;
  onCancel: (t: Todo) => void;
  onDelete: (t: Todo) => void;
  onEdit: (t: Todo, zone?: TaskEditZone) => void;
  onPriorityChange?: (t: Todo, priority: Priority) => void;
  onEffortChange?: (t: Todo, effort: Effort) => void;
  onSubtask: (t: Todo) => void;
  onDecline: (t: Todo) => void;
  onAccept: (t: Todo) => void;
  onScheduleUpdate?: (todo: Todo) => void;
  onMeet?: (todo: Todo) => void;
  meetLoadingId?: string | null;
  onCreateNote?: (todo: Todo) => void;
  hasLinkedNote?: boolean;
  onReorderSubtasks?: (orderedIds: string[]) => void;
  justCreatedId?: string | null;
  commentCounts: Record<string, number>;
  attachmentCounts: Record<string, number>;
  projects: Project[];
  subtasksOf: (id: string) => Todo[];
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
  bulkSelected: boolean;
  onBulkToggle: () => void;
  columnOrder?: TaskListColumnId[];
  visibleActions?: TaskListActionId[];
}

export default function SortableTaskRow({
  todo,
  nowMs,
  isArchived,
  meUid,
  userDisplayName,
  onComplete,
  onCancel,
  onDelete,
  onEdit,
  onPriorityChange,
  onEffortChange,
  onSubtask,
  onDecline,
  onAccept,
  onScheduleUpdate,
  onMeet,
  meetLoadingId,
  onCreateNote,
  hasLinkedNote = false,
  justCreatedId,
  commentCounts,
  attachmentCounts,
  projects,
  subtasksOf,
  expanded,
  toggleExpand,
  onReorderSubtasks,
  bulkSelected,
  onBulkToggle,
  columnOrder = DEFAULT_TASK_LIST_COLUMNS,
  visibleActions,
}: SortableTaskRowProps) {
  const { t } = useLocale();
  const { uiV2 } = useUiV2();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: todo.id,
    data: { type: "row" as const },
    animateLayoutChanges: () => false,
  });

  /**
   * Transforms on <tr> are unreliable (esp. with border-separate card rows).
   * Apply the same Translate on every <td> (no scale — avoids stretch artifacts).
   */
  const cellDragStyle: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    position: "relative",
    zIndex: isDragging ? 50 : undefined,
  };

  const withCellDrag = (cell: ReactElement | null) => {
    if (!cell || !isValidElement(cell)) return cell;
    const prev = (cell.props as { style?: CSSProperties }).style;
    return cloneElement(cell as ReactElement<{ style?: CSSProperties }>, {
      style: prev ? { ...prev, ...cellDragStyle } : cellDragStyle,
    });
  };

  const badge = PRIORITY_BADGES[todo.priority];
  const qBadge = QUADRANT_BADGES[classify(todo, nowMs)];
  const dl = todo.deadline ? deadlineLabel(todo.deadline, t) : null;
  const subs = subtasksOf(todo.id);
  const metaTag = taskListMetaTag(uiV2);

  const renderCell = (col: TaskListColumnId) => {
    switch (col) {
      case "actions":
        return (
          <td
            key={col}
            className={`pl-2 pr-0.5 py-3 align-top ${uiV2 ? "task-list-col-actions" : ""}`}
          >
            {isArchived ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onComplete(todo); }}
                title={t("todos.reactivate")}
                className="inline-flex items-center gap-1 rounded border border-green-300 dark:border-green-700 px-2 py-1 text-[11px] font-medium text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/40 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
                </svg>
                {t("todos.reactivate")}
              </button>
            ) : (
              <TaskRowActionsV2
                todo={todo}
                meUid={meUid}
                projects={projects}
                commentCount={commentCounts[todo.id] ?? 0}
                subtaskCount={subs.length}
                attachmentCount={attachmentCounts[todo.id] ?? 0}
                onComplete={onComplete}
                onSubtask={onSubtask}
                onScheduleUpdate={onScheduleUpdate}
                onMeet={onMeet}
                meetLoading={meetLoadingId === todo.id}
                onCancel={onCancel}
                onDecline={onDecline}
                onAccept={onAccept}
                onEdit={onEdit}
                onDelete={onDelete}
                onCreateNote={onCreateNote}
                hasLinkedNote={hasLinkedNote}
                justCreatedId={justCreatedId}
                suggestedSlot={todo.suggestedSlot}
                hideCompleteButton
                visibleActions={visibleActions}
              />
            )}
          </td>
        );
      case "title": {
        const titleText = displayTodoTitle(todo.title, t("todos.untitled"));
        const titleCls =
          todo.status === "completed" ? "line-through text-zinc-400" :
          todo.status === "cancelled" ? "line-through text-zinc-400 italic" :
          todo.status === "deleted" ? "line-through text-zinc-300 dark:text-slate-600" :
          "text-zinc-900 dark:text-slate-100";
        return (
          <td
            key={col}
            className={`pl-2 pr-4 py-3 ${uiV2 ? "task-list-col-title" : ""}`}
          >
            <div className={uiV2 ? "flex min-w-0 items-center gap-1.5" : undefined}>
              <span
                className={`font-medium ${titleCls}${uiV2 ? " min-w-0 truncate" : ""}`}
                title={uiV2 ? titleText : undefined}
              >
                {titleText}
              </span>
              {todo.projectId && (() => {
                const proj = projects.find((p) => p.id === todo.projectId);
                return proj ? (
                  <span className={`${uiV2 ? "shrink-0" : "ml-1.5"} inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300`}>
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                    {proj.name}
                  </span>
                ) : null;
              })()}
              {todo.assignedTo && meUid && todo.assignedTo === meUid && todo.userId !== meUid && (
                <span className={`${uiV2 ? "shrink-0" : "ml-1.5"} inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300`} title={`${t("assign.assignedBy")} ${userDisplayName(todo.userId)}`}>
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  {userDisplayName(todo.userId)}
                </span>
              )}
              {todo.assignedTo && meUid && todo.assignedTo !== meUid && (
                <span className={`${uiV2 ? "shrink-0" : "ml-1.5"} inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300`} title={`${t("assign.assignedTo")} ${userDisplayName(todo.assignedTo)}`}>
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  → {userDisplayName(todo.assignedTo)}
                </span>
              )}
              {todo.assignmentStatus && (
                <AssignmentStatusBadge
                  status={todo.assignmentStatus}
                  className={uiV2 ? "" : "ml-1.5"}
                />
              )}
              {todo.scheduledSlot && (
                <span className={uiV2 ? "shrink-0" : "ml-1.5"}><ScheduledSlotBadge slot={todo.scheduledSlot} /></span>
              )}
              {subs.length > 0 && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleExpand(todo.id); }}
                  className={`${uiV2 ? "shrink-0" : "ml-1.5"} inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 transition-colors ${SUBTASK_BADGE_CLS}`}
                >
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 5.25h16.5m-16.5-10.5H12" />
                  </svg>
                  {subs.length} {expanded.has(todo.id) ? "▴" : "▾"}
                </button>
              )}
            </div>
          </td>
        );
      }
      case "priority":
        return (
          <td
            key={col}
            className={`${uiV2 ? "px-4 task-list-col-meta" : "px-4 w-24"} py-3 align-top text-center`}
            onClick={(e) => e.stopPropagation()}
          >
            {isArchived || !onPriorityChange ? (
              <span className={`${metaTag} ${badge.cls}`}>
                {t(badge.tKey)}
              </span>
            ) : (
              <Menu
                className="w-full"
                label={t("a11y.changePriority")}
                trigger={t(badge.tKey)}
                triggerProps={{
                  className: `${metaTag} transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-500 ${badge.cls}`,
                  title: t("a11y.changePriority"),
                }}
                items={(["high", "medium", "low"] as Priority[]).map((p) => ({
                  id: p,
                  label: todo.priority === p ? `✓ ${t(PRIORITY_BADGES[p].tKey)}` : t(PRIORITY_BADGES[p].tKey),
                  onSelect: () => onPriorityChange(todo, p),
                }))}
              />
            )}
          </td>
        );
      case "effort": {
        const effort = todo.effort ?? "medium";
        const effortBadge = EFFORT_BADGES[effort];
        const mins = todo.estimatedMinutes;
        return (
          <td
            key={col}
            className={`${uiV2 ? "px-4 task-list-col-meta" : "px-4 w-24"} py-3 align-top text-center`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-stretch gap-1">
              {isArchived || !onEffortChange ? (
                <span className={`${metaTag} ${effortBadge.cls}`}>
                  {t(effortBadge.tKey)}
                </span>
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
                    onSelect: () => onEffortChange(todo, e),
                  }))}
                />
              )}
              {mins != null && (
                <span className="inline-flex shrink-0 items-center justify-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300">
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  {mins}{t("todos.estimatedMinutes")}
                </span>
              )}
            </div>
          </td>
        );
      }
      case "deadline":
        return (
          <td
            key={col}
            className={`${uiV2 ? "px-4 task-list-col-meta" : "px-4 w-24"} py-3 align-top text-center`}
            onClick={(e) => {
              e.stopPropagation();
              onEdit(todo, "planning");
            }}
          >
            {dl ? (
              <span className={`${metaTag} hover:opacity-80 transition-opacity ${dl.cls}`}>{dl.text}</span>
            ) : (
              <span className={`${metaTag} text-zinc-300 dark:text-slate-600 hover:text-zinc-500 dark:hover:text-slate-400 transition-colors`}>—</span>
            )}
          </td>
        );
      case "classification":
        return (
          <td
            key={col}
            className={`${uiV2 ? "px-4 task-list-col-meta" : "px-4 w-24"} py-3 align-top text-center`}
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
    <>
      <tr
        ref={setNodeRef}
        style={{ opacity: isDragging ? 0.55 : isArchived ? 0.5 : 1 }}
        {...attributes}
        onClick={(e) => { e.preventDefault(); onEdit(todo); }}
        className={
          uiV2
            ? `task-list-row-card group cursor-pointer select-none${isDragging ? " is-dragging" : ""}`
            : `border-b border-zinc-100 dark:border-slate-800 last:border-b-0 group hover:bg-zinc-50/60 dark:hover:bg-slate-800/60 transition-colors cursor-pointer select-none ${
                isArchived ? "opacity-50" : ""
              }`
        }
      >
        <td style={cellDragStyle} className="w-8 px-1 py-3 text-center">
          <button
            type="button"
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center justify-center w-6 h-6 rounded text-zinc-300 dark:text-slate-600 hover:text-zinc-500 dark:hover:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800 cursor-grab active:cursor-grabbing transition-colors"
            aria-label={t("a11y.reorderRow")}
            title={t("a11y.dragReorderHint")}
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="5" cy="3" r="1.2" /><circle cx="11" cy="3" r="1.2" />
              <circle cx="5" cy="8" r="1.2" /><circle cx="11" cy="8" r="1.2" />
              <circle cx="5" cy="13" r="1.2" /><circle cx="11" cy="13" r="1.2" />
            </svg>
          </button>
        </td>
        {uiV2 && (
          <td style={cellDragStyle} className="w-9 px-0.5 py-3 align-middle text-center">
            {!isArchived ? (
              <button
                type="button"
                title={t("a11y.complete")}
                aria-label={t("a11y.complete")}
                onClick={(e) => { e.stopPropagation(); onComplete(todo); }}
                className={toolbarCompleteButton}
              >
                <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </button>
            ) : null}
          </td>
        )}
        {columnOrder.map((col) => withCellDrag(renderCell(col)))}
        <td style={cellDragStyle} className="w-10 px-1 py-3 align-middle text-center">
          <input
            type="checkbox"
            checked={bulkSelected}
            onChange={(e) => { e.stopPropagation(); onBulkToggle(); }}
            onClick={(e) => e.stopPropagation()}
            className="rounded border-zinc-300 dark:border-slate-600 dark:bg-slate-800 text-emerald-600 focus:ring-emerald-500"
            aria-label={t("a11y.selectTaskRow")}
          />
        </td>
      </tr>
      {expanded.has(todo.id) && subs.length > 0 && (
        <SubtaskSortableRows
          subs={subs}
          meUid={meUid}
          nowMs={nowMs}
          onComplete={onComplete}
          onCancel={onCancel}
          onDelete={onDelete}
          onEdit={onEdit}
          onPriorityChange={onPriorityChange}
          onEffortChange={onEffortChange}
          onDecline={onDecline}
          onAccept={onAccept}
          onScheduleUpdate={onScheduleUpdate}
          onMeet={onMeet}
          meetLoadingId={meetLoadingId}
          onCreateNote={onCreateNote}
          commentCounts={commentCounts}
          attachmentCounts={attachmentCounts}
          projects={projects}
          onReorderSubtasks={onReorderSubtasks}
          columnOrder={columnOrder}
          visibleActions={visibleActions}
        />
      )}
    </>
  );
}
