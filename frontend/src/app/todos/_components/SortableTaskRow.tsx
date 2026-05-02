"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { ScheduledSlotBadge } from "@/components/SlotPicker";
import { displayTodoTitle } from "@/lib/todoDisplay";
import { classify } from "@/lib/classify";
import { deadlineLabel } from "@/lib/deadlineUtils";
import { EFFORT_BADGES } from "@/lib/effortBadges";
import { useLocale } from "@/lib/LocaleContext";
import { PRIORITY_BADGES, SUBTASK_BADGE_CLS } from "@/lib/todoConstants";
import type { Todo, Project } from "@/lib/api";

import { QUADRANT_BADGES } from "./sortUtils";
import TaskIconToolbar from "@/components/TaskIconToolbar";
import SubtaskSortableRows from "./SubtaskSortableRows";

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
  onEdit: (t: Todo) => void;
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
}: SortableTaskRowProps) {
  const { t } = useLocale();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: todo.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform ? { ...transform, scaleX: 1, scaleY: 1 } : null),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative",
    zIndex: isDragging ? 50 : undefined,
  };

  const badge = PRIORITY_BADGES[todo.priority];
  const qBadge = QUADRANT_BADGES[classify(todo, nowMs)];
  const dl = todo.deadline ? deadlineLabel(todo.deadline, t) : null;
  const subs = subtasksOf(todo.id);

  return (
    <>
      <tr
        ref={setNodeRef}
        style={style}
        {...attributes}
        onClick={(e) => { e.preventDefault(); onEdit(todo); }}
        className={`border-b border-zinc-100 dark:border-slate-800 last:border-b-0 group hover:bg-zinc-50/60 dark:hover:bg-slate-800/60 transition-colors cursor-pointer select-none ${
          isArchived ? "opacity-50" : ""
        }`}
      >
        <td className="w-8 px-1 py-3 text-center">
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
        <td className="pl-2 pr-0.5 py-3 align-top">
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
            <TaskIconToolbar
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
              isolatePointerEvents
            />
          )}
        </td>
        <td className="pl-2 pr-4 py-3">
          <span className={`font-medium ${
            todo.status === "completed" ? "line-through text-zinc-400" :
            todo.status === "cancelled" ? "line-through text-zinc-400 italic" :
            todo.status === "deleted" ? "line-through text-zinc-300 dark:text-slate-600" :
            "text-zinc-900 dark:text-slate-100"
          }`}>
            {displayTodoTitle(todo.title, t("todos.untitled"))}
          </span>
          {todo.projectId && (() => {
            const proj = projects.find((p) => p.id === todo.projectId);
            return proj ? (
              <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                {proj.name}
              </span>
            ) : null;
          })()}
          {todo.assignedTo && meUid && todo.assignedTo === meUid && todo.userId !== meUid && (
            <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" title={`${t("assign.assignedBy")} ${userDisplayName(todo.userId)}`}>
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              {userDisplayName(todo.userId)}
            </span>
          )}
          {todo.assignedTo && meUid && todo.assignedTo !== meUid && (
            <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300" title={`${t("assign.assignedTo")} ${userDisplayName(todo.assignedTo)}`}>
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              → {userDisplayName(todo.assignedTo)}
            </span>
          )}
          {todo.assignmentStatus === "declined" && (
            <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
              {t("assign.declined")}
            </span>
          )}
          {todo.assignmentStatus === "accepted" && (
            <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              {t("assign.accepted")}
            </span>
          )}
          {todo.scheduledSlot && (
            <span className="ml-1.5"><ScheduledSlotBadge slot={todo.scheduledSlot} /></span>
          )}
          {subs.length > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggleExpand(todo.id); }}
              className={`ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded transition-colors hover:bg-emerald-700 ${SUBTASK_BADGE_CLS}`}
            >
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 5.25h16.5m-16.5-10.5H12" />
              </svg>
              {subs.length} {expanded.has(todo.id) ? "▴" : "▾"}
            </button>
          )}
        </td>
        <td className="px-4 py-3 w-24 align-top">
          <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${badge.cls}`}>
            {t(badge.tKey)}
          </span>
        </td>
        <td className="px-4 py-3 w-24 align-top">
          <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${EFFORT_BADGES[todo.effort ?? "medium"].cls}`}>
            {t(EFFORT_BADGES[todo.effort ?? "medium"].tKey)}
          </span>
          {(() => {
            const mins = todo.estimatedMinutes;
            if (mins == null) return null;
            return (
              <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300">
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {mins}{t("todos.estimatedMinutes")}
              </span>
            );
          })()}
        </td>
        <td className="px-4 py-3 w-24 align-top">
          {dl ? (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${dl.cls}`}>{dl.text}</span>
          ) : (
            <span className="text-xs text-zinc-300">—</span>
          )}
        </td>
        <td className="px-4 py-3 w-24 align-top">
          <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded ${qBadge.cls}`}>
            {t(qBadge.tKey)}
          </span>
        </td>
        <td className="w-10 px-1 py-3 align-middle text-center">
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
          onComplete={onComplete}
          onCancel={onCancel}
          onDelete={onDelete}
          onEdit={onEdit}
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
        />
      )}
    </>
  );
}
