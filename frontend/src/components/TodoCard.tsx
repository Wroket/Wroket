"use client";

import { useLocale } from "@/lib/LocaleContext";
import type { Todo, Project } from "@/lib/api";
import { displayTodoTitle } from "@/lib/todoDisplay";
import { classify } from "@/lib/classify";
import { deadlineLabel } from "@/lib/deadlineUtils";
import { EFFORT_BADGES } from "@/lib/effortBadges";
import {
  PRIORITY_BADGES,
  QUADRANT_CONFIG,
  SUBTASK_BADGE_CLS,
} from "@/lib/todoConstants";
import CommentHoverIcon from "@/components/CommentHoverIcon";
import SlotPicker, { ScheduledSlotBadge } from "@/components/SlotPicker";
import TaskRowActionsMenu from "@/components/TaskRowActionsMenu";
import { useUiBeta } from "@/lib/UiBetaContext";

interface TodoCardProps {
  todo: Todo;
  onComplete: (t: Todo) => void;
  onDelete: (t: Todo) => void;
  onDecline?: (t: Todo) => void;
  onAccept?: (t: Todo) => void;
  onEdit?: (t: Todo) => void;
  onScheduleUpdate?: (t: Todo) => void;
  subtaskCount?: number;
  onToggleSubtasks?: () => void;
  subtasksExpanded?: boolean;
  meUid?: string | null;
  userDisplayName?: (uid: string) => string;
  commentCount?: number;
  projects?: Project[];
}

export default function TodoCard({
  todo,
  onComplete,
  onDelete,
  onDecline,
  onAccept,
  onEdit,
  onScheduleUpdate,
  subtaskCount = 0,
  onToggleSubtasks,
  subtasksExpanded = false,
  meUid,
  userDisplayName,
  commentCount = 0,
  projects = [],
}: TodoCardProps) {
  const { t } = useLocale();
  const { betaUi } = useUiBeta();
  const badge = PRIORITY_BADGES[todo.priority];
  const dl = todo.deadline ? deadlineLabel(todo.deadline, t) : null;

  let slotDateMin: string | undefined;
  let slotDateMax: string | undefined;
  if (todo.phaseId) {
    for (const proj of projects) {
      const ph = proj.phases?.find((p) => p.id === todo.phaseId);
      if (ph) { slotDateMin = ph.startDate ?? undefined; slotDateMax = ph.endDate ?? undefined; break; }
    }
  }

  return (
    <div
      tabIndex={0}
      role="button"
      onDoubleClick={(e) => { e.preventDefault(); onEdit?.(todo); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEdit?.(todo); } }}
      className={
        betaUi
          ? "group bg-white dark:bg-slate-900/90 rounded-sm border border-zinc-200 dark:border-slate-600/50 pl-1 pr-2 py-2 flex items-start gap-2 shadow-none hover:bg-zinc-50/90 dark:hover:bg-slate-800/50 transition-colors cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
          : "group bg-white dark:bg-slate-900/80 rounded border border-zinc-200 dark:border-slate-600/40 pl-1 pr-3 py-2.5 flex items-start gap-2.5 shadow-sm hover:shadow transition-shadow cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
      }
    >
      <div className={`w-1 self-stretch rounded-full shrink-0 ${QUADRANT_CONFIG[classify(todo)].accentBar}`} />
      {todo.status !== "active" ? (
        <button
          onClick={() => onComplete(todo)}
          title="Remettre en tâche active"
          className="mt-0.5 shrink-0 inline-flex items-center gap-0.5 rounded border border-green-300 dark:border-green-700 px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/40 transition-colors"
        >
          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
          </svg>
          {t("todos.reactivate")}
        </button>
      ) : (
        <button
          onClick={() => onComplete(todo)}
          className="mt-0.5 w-[18px] h-[18px] rounded flex items-center justify-center shrink-0 border-2 border-zinc-300 dark:border-slate-500 hover:border-green-500 hover:text-green-500"
          aria-label={t("a11y.complete")}
        >
          <svg className="w-2.5 h-2.5 text-zinc-300 dark:text-slate-600 group-hover:text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </button>
      )}
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug font-medium truncate ${todo.status !== "active" ? "line-through text-zinc-400" : "text-zinc-900 dark:text-slate-100"}`}>{displayTodoTitle(todo.title, t("todos.untitled"))}</p>
        <div className="flex items-center gap-1 mt-1 flex-wrap gap-y-1">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap ${badge.cls}`}>{t(badge.tKey)}</span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap ${EFFORT_BADGES[todo.effort ?? "medium"].cls}`}>{t(EFFORT_BADGES[todo.effort ?? "medium"].tKey)}</span>
          {todo.estimatedMinutes != null && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300">
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {todo.estimatedMinutes}{t("todos.estimatedMinutes")}
            </span>
          )}
          {dl && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap ${dl.cls}`}>{dl.text}</span>}
          {todo.assignedTo && meUid && todo.assignedTo === meUid && todo.userId !== meUid && userDisplayName && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
              <svg className="w-2.5 h-2.5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              {userDisplayName(todo.userId)}
            </span>
          )}
          {todo.assignedTo && meUid && todo.assignedTo !== meUid && userDisplayName && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300">
              <svg className="w-2.5 h-2.5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              → {userDisplayName(todo.assignedTo)}
            </span>
          )}
          {todo.assignmentStatus === "declined" && (
            <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
              {t("assign.declined")}
            </span>
          )}
          {todo.assignmentStatus === "accepted" && (
            <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              {t("assign.accepted")}
            </span>
          )}
          {todo.recurrence && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
              🔄
            </span>
          )}
          {todo.scheduledSlot && (
            <ScheduledSlotBadge slot={todo.scheduledSlot} />
          )}
          {subtaskCount > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleSubtasks?.(); }}
              className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap transition-colors ${SUBTASK_BADGE_CLS} hover:bg-emerald-700`}
            >
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 5.25h16.5m-16.5-10.5H12" />
              </svg>
              {subtaskCount} {subtasksExpanded ? "▴" : "▾"}
            </button>
          )}
        </div>
      </div>
      {todo.status === "active" && !betaUi && (
        <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
          {todo.assignedTo && meUid && todo.assignedTo === meUid && todo.userId !== meUid && todo.assignmentStatus !== "declined" && onDecline && (
            <button
              onClick={(e) => { e.stopPropagation(); onDecline(todo); }}
              className="text-orange-300 dark:text-orange-700 hover:text-orange-600 dark:hover:text-orange-400"
              aria-label={t("assign.decline")}
              title={t("assign.decline")}
            >
              <svg className="w-3.5 h-3.5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          {todo.assignedTo && meUid && todo.assignedTo === meUid && todo.userId !== meUid && (todo.assignmentStatus === "declined" || todo.assignmentStatus === "pending") && onAccept && (
            <button
              onClick={(e) => { e.stopPropagation(); onAccept(todo); }}
              className="text-emerald-300 dark:text-emerald-700 hover:text-emerald-600 dark:hover:text-emerald-400"
              aria-label={t("assign.accept")}
              title={t("assign.accept")}
            >
              <svg className="w-3.5 h-3.5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </button>
          )}
          {!todo.parentId && onScheduleUpdate && (
            <SlotPicker
              todoId={todo.id}
              scheduledSlot={todo.scheduledSlot}
              suggestedSlot={todo.suggestedSlot}
              onBooked={onScheduleUpdate}
              onCleared={onScheduleUpdate}
              dateMin={slotDateMin}
              dateMax={slotDateMax}
            />
          )}
          <CommentHoverIcon
            todoId={todo.id}
            commentCount={commentCount}
            onClick={() => onEdit?.(todo)}
          />
          {onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(todo); }}
              className="text-zinc-300 dark:text-slate-600 hover:text-blue-500 dark:hover:text-blue-400"
              aria-label={t("a11y.edit")}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
          <button
            onClick={() => onDelete(todo)}
            className="text-zinc-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400"
            aria-label={t("a11y.delete")}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      )}
      {todo.status === "active" && betaUi && (
        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          {!todo.parentId && onScheduleUpdate && (
            <SlotPicker
              todoId={todo.id}
              scheduledSlot={todo.scheduledSlot}
              suggestedSlot={todo.suggestedSlot}
              onBooked={onScheduleUpdate}
              onCleared={onScheduleUpdate}
              dateMin={slotDateMin}
              dateMax={slotDateMax}
            />
          )}
          <TaskRowActionsMenu
            todo={todo}
            meUid={meUid}
            subtaskCount={subtaskCount}
            subtasksExpanded={subtasksExpanded}
            commentCount={commentCount}
            onEdit={onEdit}
            onDelete={onDelete}
            onComplete={onComplete}
            onDecline={onDecline}
            onAccept={onAccept}
            onToggleSubtasks={subtaskCount > 0 ? onToggleSubtasks : undefined}
          />
        </div>
      )}
      {todo.status !== "active" && betaUi && (
        <div className="flex items-center shrink-0 mt-0.5">
          <TaskRowActionsMenu
            todo={todo}
            meUid={meUid}
            subtaskCount={subtaskCount}
            subtasksExpanded={subtasksExpanded}
            commentCount={commentCount}
            onEdit={onEdit}
            onDelete={onDelete}
            onComplete={onComplete}
            onDecline={onDecline}
            onAccept={onAccept}
            onToggleSubtasks={subtaskCount > 0 ? onToggleSubtasks : undefined}
          />
        </div>
      )}
    </div>
  );
}
