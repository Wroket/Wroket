"use client";

import { arrayMove } from "@dnd-kit/sortable";

import { deadlineLabel } from "@/lib/deadlineUtils";
import { EFFORT_BADGES } from "@/lib/effortBadges";
import { useLocale } from "@/lib/LocaleContext";
import { PRIORITY_BADGES } from "@/lib/todoConstants";
import type { Todo } from "@/lib/api";

export interface SubtaskSortableRowsProps {
  subs: Todo[];
  onComplete: (t: Todo) => void;
  onCancel: (t: Todo) => void;
  onDelete: (t: Todo) => void;
  onReorderSubtasks?: (orderedIds: string[]) => void;
}

export default function SubtaskSortableRows({
  subs,
  onComplete,
  onCancel,
  onDelete,
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
                    title="Monter"
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
                    title="Descendre"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              )}
            </td>
            <td className="px-4 py-2 pl-8">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onComplete(sub)}
                  className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border ${
                    sub.status === "completed"
                      ? "bg-green-500 border-green-500 text-white"
                      : "border-zinc-300 dark:border-slate-500 text-zinc-400 hover:border-green-500 hover:text-green-500"
                  } transition-colors`}
                >
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </button>
                <button
                  onClick={() => onCancel(sub)}
                  title="Annuler"
                  className="w-5 h-5 rounded flex items-center justify-center border border-zinc-300 dark:border-slate-600 text-zinc-400 hover:border-zinc-500 hover:text-zinc-500"
                >
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                </button>
                <button
                  onClick={() => onDelete(sub)}
                  className="w-5 h-5 rounded flex items-center justify-center border border-transparent text-zinc-300 hover:text-red-500"
                >
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </td>
            <td className="px-4 py-2">
              <span className="text-zinc-400 mr-1.5">↳</span>
              <span className={`text-sm ${sub.status === "completed" ? "line-through text-zinc-400" : "text-zinc-700 dark:text-slate-300"}`}>
                {sub.title}
              </span>
            </td>
            <td className="px-4 py-2">
              <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${subBadge.cls}`}>{t(subBadge.tKey)}</span>
            </td>
            <td className="px-4 py-2">
              <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${EFFORT_BADGES[sub.effort ?? "medium"].cls}`}>{t(EFFORT_BADGES[sub.effort ?? "medium"].tKey)}</span>
            </td>
            <td className="px-4 py-2">
              {subDl ? <span className={`text-xs font-semibold px-2 py-0.5 rounded ${subDl.cls}`}>{subDl.text}</span> : <span className="text-xs text-zinc-300">—</span>}
            </td>
            <td className="px-4 py-2" />
          </tr>
        );
      })}
    </>
  );
}
