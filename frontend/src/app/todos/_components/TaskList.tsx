"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  attachmentCounts?: Record<string, number>;
  onReorder?: (orderedIds: string[]) => void;
  /** Horodatage partagé avec le radar pour tri et badges de quadrant. */
  nowMs?: number;
  onBulkComplete: (todos: Todo[]) => void | Promise<void>;
  onBulkArchive: (todos: Todo[]) => void | Promise<void>;
  onBulkDelete: (todos: Todo[]) => void;
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
  attachmentCounts = {},
  onReorder,
  nowMs,
  onBulkComplete,
  onBulkArchive,
  onBulkDelete,
}: TaskListProps) {
  const { t } = useLocale();
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const sorted = useMemo(() => sortTodos(todos, sortCol, sortDir, nowMs), [todos, sortCol, sortDir, nowMs]);

  const [displayOrder, setDisplayOrder] = useState<Todo[]>(sorted);
  useEffect(() => { setDisplayOrder(sorted); }, [sorted]);

  useEffect(() => {
    const visible = new Set(displayOrder.map((x) => x.id));
    setSelectedIds((prev) => {
      let removed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (visible.has(id)) next.add(id);
        else removed = true;
      }
      return removed ? next : prev;
    });
  }, [displayOrder]);

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
  /** Priorité, Effort, Échéance, Classification : même largeur */
  const metaCol = "w-24";

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

  const selectedCount = useMemo(() => {
    let n = 0;
    for (const row of displayOrder) {
      if (selectedIds.has(row.id)) n += 1;
    }
    return n;
  }, [displayOrder, selectedIds]);

  const allVisibleSelected =
    displayOrder.length > 0 && selectedCount === displayOrder.length;

  useEffect(() => {
    const el = selectAllRef.current;
    if (!el) return;
    el.indeterminate = selectedCount > 0 && !allVisibleSelected;
  }, [selectedCount, allVisibleSelected]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (displayOrder.length === 0) return prev;
      const allIds = displayOrder.map((x) => x.id);
      const allOn = allIds.every((id) => prev.has(id));
      return allOn ? new Set() : new Set(allIds);
    });
  }, [displayOrder]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const selectedTodos = useMemo(
    () => displayOrder.filter((row) => selectedIds.has(row.id)),
    [displayOrder, selectedIds],
  );

  const handleBulkCompleteClick = useCallback(async () => {
    if (selectedTodos.length === 0) return;
    await onBulkComplete(selectedTodos);
    clearSelection();
  }, [selectedTodos, onBulkComplete, clearSelection]);

  const handleBulkArchiveClick = useCallback(async () => {
    if (selectedTodos.length === 0) return;
    await onBulkArchive(selectedTodos);
    clearSelection();
  }, [selectedTodos, onBulkArchive, clearSelection]);

  const handleBulkDeleteClick = useCallback(() => {
    if (selectedTodos.length === 0) return;
    onBulkDelete(selectedTodos);
  }, [selectedTodos, onBulkDelete]);

  return (
    <div>
      <div className="bg-white dark:bg-slate-900 rounded-md shadow-sm border border-zinc-200 dark:border-slate-700 overflow-x-auto">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <table className="w-full text-sm min-w-[676px]">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-slate-700 bg-zinc-50/80 dark:bg-slate-800/80">
                  <th className="w-8 px-1 py-3" />
                  <th className="w-16 pl-2 pr-0.5 py-3 text-left font-semibold text-zinc-600 dark:text-slate-400 text-xs">{t("table.actions")}</th>
                  <th className="text-left pl-2 pr-4 py-3 font-semibold text-zinc-600 dark:text-slate-400">{t("table.title")}</th>
                  <th className={`text-left ${thPad} font-semibold text-zinc-600 dark:text-slate-400 ${metaCol}`}>
                    <button type="button" className={thBtn} onClick={() => onSort("priority")}>
                      {t("table.priority")} <SortArrow col="priority" activeCol={sortCol} dir={sortDir} />
                    </button>
                  </th>
                  <th className={`text-left ${thPad} font-semibold text-zinc-600 dark:text-slate-400 ${metaCol}`}>
                    {t("table.effort")}
                  </th>
                  <th className={`text-left ${thPad} font-semibold text-zinc-600 dark:text-slate-400 ${metaCol}`}>
                    <button type="button" className={thBtn} onClick={() => onSort("deadline")}>
                      {t("table.deadline")} <SortArrow col="deadline" activeCol={sortCol} dir={sortDir} />
                    </button>
                  </th>
                  <th className={`text-left ${thPad} font-semibold text-zinc-600 dark:text-slate-400 ${metaCol}`}>
                    <button type="button" className={thBtn} onClick={() => onSort("classification")}>
                      {t("table.classification")} <SortArrow col="classification" activeCol={sortCol} dir={sortDir} />
                    </button>
                  </th>
                  <th className="w-10 px-1 py-3 text-center font-semibold text-zinc-600 dark:text-slate-400 text-xs">
                    <span className="sr-only">{t("table.select")}</span>
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={(e) => { e.stopPropagation(); toggleSelectAll(); }}
                      className="rounded border-zinc-300 dark:border-slate-600 dark:bg-slate-800 text-emerald-600 focus:ring-emerald-500"
                      aria-label={t("a11y.selectAllTasks")}
                      disabled={displayOrder.length === 0}
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {selectedCount > 0 && (
                  <tr className="border-b border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/90 dark:bg-emerald-950/35">
                    <td colSpan={8} className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2 gap-y-2">
                        <span className="text-xs font-medium text-emerald-900 dark:text-emerald-100 mr-1">
                          {t("bulk.selectedCount").replace("{{count}}", String(selectedCount))}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleBulkCompleteClick()}
                          className="inline-flex items-center justify-center shrink-0 text-xs font-medium whitespace-nowrap px-2.5 py-1 rounded-md bg-white dark:bg-slate-800 border border-emerald-200/80 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
                        >
                          {t("bulk.complete")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleBulkArchiveClick()}
                          className="inline-flex items-center justify-center shrink-0 text-xs font-medium whitespace-nowrap px-2.5 py-1 rounded-md bg-white dark:bg-slate-800 border border-violet-200/80 dark:border-violet-800/60 text-violet-800 dark:text-violet-200 hover:bg-violet-50 dark:hover:bg-violet-950/40 transition-colors"
                        >
                          {t("bulk.archive")}
                        </button>
                        <button
                          type="button"
                          onClick={handleBulkDeleteClick}
                          className="inline-flex items-center justify-center shrink-0 text-xs font-medium whitespace-nowrap px-2.5 py-1 rounded-md bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                        >
                          {t("bulk.delete")}
                        </button>
                        <button
                          type="button"
                          onClick={clearSelection}
                          className="text-xs font-medium px-2.5 py-1 rounded-md text-emerald-700 dark:text-emerald-300 hover:underline ml-auto"
                        >
                          {t("bulk.clearSelection")}
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
                {displayOrder.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-zinc-400 italic">
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
                      attachmentCounts={attachmentCounts}
                      projects={projects}
                      subtasksOf={subtasksOf}
                      expanded={expanded}
                      toggleExpand={toggleExpand}
                      bulkSelected={selectedIds.has(todo.id)}
                      onBulkToggle={() => toggleSelect(todo.id)}
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
