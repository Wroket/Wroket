"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import CommentHoverIcon from "@/components/CommentHoverIcon";
import SlotPicker, { ScheduledSlotBadge } from "@/components/SlotPicker";
import { displayTodoTitle } from "@/lib/todoDisplay";
import { classify } from "@/lib/classify";
import { deadlineLabel } from "@/lib/deadlineUtils";
import { EFFORT_BADGES } from "@/lib/effortBadges";
import { useLocale } from "@/lib/LocaleContext";
import { PRIORITY_BADGES, SUBTASK_BADGE_CLS } from "@/lib/todoConstants";
import type { Todo, Project } from "@/lib/api";

import { QUADRANT_BADGES } from "./sortUtils";
import SubtaskSortableRows from "./SubtaskSortableRows";

export interface SortableTaskRowProps {
  todo: Todo;
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
  onCreateNote?: (todo: Todo) => void;
  hasLinkedNote?: boolean;
  onReorderSubtasks?: (orderedIds: string[]) => void;
  justCreatedId?: string | null;
  commentCounts: Record<string, number>;
  projects: Project[];
  subtasksOf: (id: string) => Todo[];
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
}

export default function SortableTaskRow({
  todo,
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
  onCreateNote,
  hasLinkedNote = false,
  justCreatedId,
  commentCounts,
  projects,
  subtasksOf,
  expanded,
  toggleExpand,
  onReorderSubtasks,
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
  const qBadge = QUADRANT_BADGES[classify(todo)];
  const dl = todo.deadline ? deadlineLabel(todo.deadline, t) : null;
  const subs = subtasksOf(todo.id);

  return (
    <>
      <tr
        ref={setNodeRef}
        style={style}
        {...attributes}
        onDoubleClick={(e) => { e.preventDefault(); onEdit(todo); }}
        className={`border-b border-zinc-100 dark:border-slate-800 last:border-b-0 group hover:bg-zinc-50/60 dark:hover:bg-slate-800/60 transition-colors cursor-pointer select-none ${
          isArchived ? "opacity-50" : ""
        }`}
      >
        <td className="w-8 px-1 py-3 text-center">
          <button
            type="button"
            {...listeners}
            className="inline-flex items-center justify-center w-6 h-6 rounded text-zinc-300 dark:text-slate-600 hover:text-zinc-500 dark:hover:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800 cursor-grab active:cursor-grabbing transition-colors"
            aria-label="Réordonner"
            title="Glisser pour réordonner"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="5" cy="3" r="1.2" /><circle cx="11" cy="3" r="1.2" />
              <circle cx="5" cy="8" r="1.2" /><circle cx="11" cy="8" r="1.2" />
              <circle cx="5" cy="13" r="1.2" /><circle cx="11" cy="13" r="1.2" />
            </svg>
          </button>
        </td>
        <td className="px-4 py-3">
          {isArchived ? (
            <button
              onClick={() => onComplete(todo)}
              title="Remettre en tâche active"
              className="inline-flex items-center gap-1 rounded border border-green-300 dark:border-green-700 px-2 py-1 text-[11px] font-medium text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/40 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
              </svg>
              {t("todos.reactivate")}
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onComplete(todo)}
                title="Accomplir"
                className="w-6 h-6 rounded flex items-center justify-center border border-zinc-300 text-zinc-400 hover:border-green-500 hover:text-green-500"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </button>
              {!todo.parentId && (
                <button
                  onClick={() => onSubtask(todo)}
                  className="w-6 h-6 rounded flex items-center justify-center border border-zinc-300 dark:border-slate-600 text-zinc-400 hover:border-blue-500 hover:text-blue-500"
                  title={t("subtask.add")}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              )}
              {!todo.parentId && onScheduleUpdate && (() => {
                let dateMin: string | undefined;
                let dateMax: string | undefined;
                if (todo.phaseId) {
                  for (const proj of projects) {
                    const ph = proj.phases?.find((p) => p.id === todo.phaseId);
                    if (ph) { dateMin = ph.startDate ?? undefined; dateMax = ph.endDate ?? undefined; break; }
                  }
                }
                return (
                  <SlotPicker
                    todoId={todo.id}
                    scheduledSlot={todo.scheduledSlot}
                    onBooked={onScheduleUpdate}
                    onCleared={onScheduleUpdate}
                    autoOpen={todo.id === justCreatedId}
                    dateMin={dateMin}
                    dateMax={dateMax}
                  />
                );
              })()}
              <button
                onClick={() => onCancel(todo)}
                title="Annuler"
                className="w-6 h-6 rounded flex items-center justify-center border border-zinc-300 text-zinc-400 hover:border-zinc-500 hover:text-zinc-500"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </button>
              {todo.assignedTo && meUid && todo.assignedTo === meUid && todo.userId !== meUid && todo.assignmentStatus !== "declined" && (
                <button
                  onClick={() => onDecline(todo)}
                  title={t("assign.decline")}
                  className="w-6 h-6 rounded flex items-center justify-center border border-orange-300 dark:border-orange-700 text-orange-400 hover:border-orange-500 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              {todo.assignedTo && meUid && todo.assignedTo === meUid && todo.userId !== meUid && (todo.assignmentStatus === "declined" || todo.assignmentStatus === "pending") && (
                <button
                  onClick={() => onAccept(todo)}
                  title={t("assign.accept")}
                  className="w-6 h-6 rounded flex items-center justify-center border border-emerald-300 dark:border-emerald-700 text-emerald-400 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </button>
              )}
              <CommentHoverIcon
                todoId={todo.id}
                commentCount={commentCounts[todo.id] ?? 0}
                onClick={() => onEdit(todo)}
                buttonClass="relative w-6 h-6 rounded flex items-center justify-center border border-transparent text-zinc-300 dark:text-slate-600 hover:text-blue-500 dark:hover:text-blue-400"
                iconSize="w-3 h-3"
              />
              {onCreateNote && (
                <button
                  onClick={() => onCreateNote(todo)}
                  title={hasLinkedNote ? t("notes.openLinkedNote") : t("notes.createFromTask")}
                  className={`w-6 h-6 rounded flex items-center justify-center border transition-colors ${
                    hasLinkedNote
                      ? "border-indigo-300 dark:border-indigo-700 text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40"
                      : "border-transparent text-zinc-300 dark:text-slate-600 hover:text-indigo-500 dark:hover:text-indigo-400"
                  }`}
                >
                  <svg className="w-3 h-3" fill={hasLinkedNote ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => onDelete(todo)}
                title="Supprimer"
                className="w-6 h-6 rounded flex items-center justify-center border border-transparent text-zinc-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          )}
        </td>
        <td className="px-4 py-3">
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
        <td className="px-4 py-3">
          <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${badge.cls}`}>
            {t(badge.tKey)}
          </span>
        </td>
        <td className="px-4 py-3">
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
        <td className="px-4 py-3">
          {dl ? (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${dl.cls}`}>{dl.text}</span>
          ) : (
            <span className="text-xs text-zinc-300">—</span>
          )}
        </td>
        <td className="px-4 py-3">
          <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded ${qBadge.cls}`}>
            {t(qBadge.tKey)}
          </span>
        </td>
      </tr>
      {expanded.has(todo.id) && subs.length > 0 && (
        <SubtaskSortableRows
          subs={subs}
          onComplete={onComplete}
          onCancel={onCancel}
          onDelete={onDelete}
          onReorderSubtasks={onReorderSubtasks}
        />
      )}
    </>
  );
}
