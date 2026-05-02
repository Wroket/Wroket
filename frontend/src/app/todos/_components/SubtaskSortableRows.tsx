"use client";

import { arrayMove } from "@dnd-kit/sortable";

import { displayTodoTitle } from "@/lib/todoDisplay";
import { deadlineLabel } from "@/lib/deadlineUtils";
import { EFFORT_BADGES } from "@/lib/effortBadges";
import { useLocale } from "@/lib/LocaleContext";
import { PRIORITY_BADGES } from "@/lib/todoConstants";
import type { Project, Todo } from "@/lib/api";
import TaskIconToolbar from "@/components/TaskIconToolbar";

export interface SubtaskSortableRowsProps {
  subs: Todo[];
  meUid: string | null;
  onComplete: (t: Todo) => void;
  onCancel: (t: Todo) => void;
  onDelete: (t: Todo) => void;
  onEdit: (t: Todo) => void;
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
}

export default function SubtaskSortableRows({
  subs,
  meUid,
  onComplete,
  onCancel,
  onDelete,
  onEdit,
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
}: SubtaskSortableRowsProps) {
  const { t } = useLocale();

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
        return (
          <tr
            key={sub.id}
            className="border-b border-zinc-100 dark:border-slate-800 last:border-b-0 bg-zinc-50/40 dark:bg-slate-800/30"
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
            <td className="py-2 pl-8 pr-0.5 align-top">
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
            </td>
            <td className="pl-2 pr-4 py-2">
              <span className="text-zinc-400 mr-1.5">↳</span>
              <span className={`text-sm ${sub.status === "completed" ? "line-through text-zinc-400" : "text-zinc-700 dark:text-slate-300"}`}>
                {displayTodoTitle(sub.title, t("todos.untitled"))}
              </span>
            </td>
            <td className="px-4 py-2 w-24 align-top">
              <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${subBadge.cls}`}>{t(subBadge.tKey)}</span>
            </td>
            <td className="px-4 py-2 w-24 align-top">
              <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${EFFORT_BADGES[sub.effort ?? "medium"].cls}`}>{t(EFFORT_BADGES[sub.effort ?? "medium"].tKey)}</span>
            </td>
            <td className="px-4 py-2 w-24 align-top">
              {subDl ? <span className={`text-xs font-semibold px-2 py-0.5 rounded ${subDl.cls}`}>{subDl.text}</span> : <span className="text-xs text-zinc-300">—</span>}
            </td>
            <td className="px-4 py-2 w-24 align-top" />
            <td className="w-10 px-1 py-2 bg-zinc-50/40 dark:bg-slate-800/30" aria-hidden />
          </tr>
        );
      })}
    </>
  );
}
