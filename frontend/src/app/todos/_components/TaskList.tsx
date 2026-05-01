"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { useLocale } from "@/lib/LocaleContext";
import type { Todo, Project } from "@/lib/api";
import type { SortColumn, SortDirection } from "@/lib/todoConstants";

import SortArrow from "./SortArrow";
import SortableTaskRow from "./SortableTaskRow";
import { sortTodos } from "./sortUtils";

export interface TaskListProps {
  todos: Todo[];
  allTodos: Todo[];
  sortCol: SortColumn;
  sortDir: SortDirection;
  meUid: string | null;
  userDisplayName: (uid: string) => string;
  onSort: (col: SortColumn) => void;
  onComplete: (t: Todo) => void;
  onCancel: (t: Todo) => void;
  onDelete: (t: Todo) => void;
  onEdit: (t: Todo) => void;
  onSubtask: (t: Todo) => void;
  onDecline: (t: Todo) => void;
  onAccept: (t: Todo) => void;
  projects?: Project[];
  onScheduleUpdate?: (todo: Todo) => void;
  onMeet?: (todo: Todo) => void;
  meetLoadingId?: string | null;
  onCreateNote?: (todo: Todo) => void;
  todoNoteIds?: Record<string, string>;
  onReorderSubtasks?: (orderedIds: string[]) => void;
  justCreatedId?: string | null;
  commentCounts?: Record<string, number>;
  onReorder?: (orderedIds: string[]) => void;
  /** Horodatage partagé avec le radar pour tri et badges de quadrant. */
  nowMs?: number;
}

export default function TaskList({
  todos,
  allTodos,
  sortCol,
  sortDir,
  meUid,
  userDisplayName,
  onSort,
  onComplete,
  onCancel,
  onDelete,
  onEdit,
  onSubtask,
  onDecline,
  onAccept,
  projects = [],
  onScheduleUpdate,
  onMeet,
  meetLoadingId,
  onCreateNote,
  todoNoteIds = {},
  onReorderSubtasks,
  justCreatedId,
  commentCounts = {},
  onReorder,
  nowMs,
}: TaskListProps) {
  const { t } = useLocale();
  const sorted = useMemo(() => sortTodos(todos, sortCol, sortDir, nowMs), [todos, sortCol, sortDir, nowMs]);

  const [displayOrder, setDisplayOrder] = useState<Todo[]>(sorted);
  useEffect(() => { setDisplayOrder(sorted); }, [sorted]);

  const childrenByParent = useMemo(() => {
    const map: Record<string, Todo[]> = {};
    for (const td of allTodos) {
      if (td.parentId) (map[td.parentId] ??= []).push(td);
    }
    return map;
  }, [allTodos]);
  const subtasksOf = (id: string) => childrenByParent[id] ?? [];
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const thBtn = "flex items-center gap-0.5 cursor-pointer select-none hover:text-zinc-900 transition-colors";
  const thPad = "px-4 py-3";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDisplayOrder((prev) => {
      const oldIdx = prev.findIndex((t) => t.id === active.id);
      const newIdx = prev.findIndex((t) => t.id === (over.id as string));
      if (oldIdx === -1 || newIdx === -1) return prev;
      const next = arrayMove(prev, oldIdx, newIdx);
      onReorder?.(next.map((t) => t.id));
      return next;
    });
  }, [onReorder]);

  const sortableIds = useMemo(() => displayOrder.map((t) => t.id), [displayOrder]);

  return (
    <div>
      <div className="bg-white dark:bg-slate-900 rounded-md shadow-sm border border-zinc-200 dark:border-slate-700 overflow-x-auto">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-slate-700 bg-zinc-50/80 dark:bg-slate-800/80">
                  <th className="w-8 px-1 py-3" />
                  <th className={`w-20 ${thPad} text-left font-semibold text-zinc-600 dark:text-slate-400 text-xs`}>{t("table.actions")}</th>
                  <th className={`text-left ${thPad} font-semibold text-zinc-600 dark:text-slate-400`}>{t("table.title")}</th>
                  <th className={`text-left ${thPad} font-semibold text-zinc-600 dark:text-slate-400 w-28`}>
                    <button type="button" className={thBtn} onClick={() => onSort("priority")}>
                      {t("table.priority")} <SortArrow col="priority" activeCol={sortCol} dir={sortDir} />
                    </button>
                  </th>
                  <th className={`text-left ${thPad} font-semibold text-zinc-600 dark:text-slate-400 w-32`}>
                    {t("table.effort")}
                  </th>
                  <th className={`text-left ${thPad} font-semibold text-zinc-600 dark:text-slate-400 w-36`}>
                    <button type="button" className={thBtn} onClick={() => onSort("deadline")}>
                      {t("table.deadline")} <SortArrow col="deadline" activeCol={sortCol} dir={sortDir} />
                    </button>
                  </th>
                  <th className={`text-left ${thPad} font-semibold text-zinc-600 dark:text-slate-400 w-36`}>
                    <button type="button" className={thBtn} onClick={() => onSort("classification")}>
                      {t("table.classification")} <SortArrow col="classification" activeCol={sortCol} dir={sortDir} />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayOrder.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-zinc-400 italic">
                      {t("matrix.empty")}
                    </td>
                  </tr>
                ) : (
                  displayOrder.map((todo) => (
                    <SortableTaskRow
                      key={todo.id}
                      todo={todo}
                      nowMs={nowMs}
                      isArchived={todo.status !== "active"}
                      meUid={meUid}
                      userDisplayName={userDisplayName}
                      onComplete={onComplete}
                      onCancel={onCancel}
                      onDelete={onDelete}
                      onEdit={onEdit}
                      onSubtask={onSubtask}
                      onDecline={onDecline}
                      onAccept={onAccept}
                      onScheduleUpdate={onScheduleUpdate}
                      onMeet={onMeet}
                      meetLoadingId={meetLoadingId}
                      onCreateNote={onCreateNote}
                      hasLinkedNote={!!todoNoteIds[todo.id]}
                      onReorderSubtasks={onReorderSubtasks}
                      justCreatedId={justCreatedId}
                      commentCounts={commentCounts}
                      projects={projects}
                      subtasksOf={subtasksOf}
                      expanded={expanded}
                      toggleExpand={toggleExpand}
                    />
                  ))
                )}
              </tbody>
            </table>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
