"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { useLocale } from "@/lib/LocaleContext";
import { useUiV2 } from "@/lib/UiVersionContext";
import { useAuth } from "@/components/AuthContext";
import { useToast } from "@/components/Toast";
import { updateProfile } from "@/lib/api";
import type { Todo, Project, Priority, Effort } from "@/lib/api";
import type { TaskEditZone } from "@/components/TaskEditModal";
import type { SortColumn, SortDirection } from "@/lib/todoConstants";

import SortArrow from "./SortArrow";
import SortableTaskRow from "./SortableTaskRow";
import { sortTodos } from "./sortUtils";
import {
  DEFAULT_TASK_LIST_COLUMNS,
  sanitizeColumnOrder,
  type TaskListColumnId,
} from "./taskListColumns";
import ActionsVisibilityPicker from "./ActionsVisibilityPicker";
import {
  readVisibleActions,
  writeVisibleActions,
  type TaskListActionId,
} from "@/lib/taskListVisibleActions";

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
  onEdit: (t: Todo, zone?: TaskEditZone) => void;
  onPriorityChange?: (t: Todo, priority: Priority) => void;
  onEffortChange?: (t: Todo, effort: Effort) => void;
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

function ColumnDragHandle({ listeners, attributes }: {
  listeners: ReturnType<typeof useSortable>["listeners"];
  attributes: ReturnType<typeof useSortable>["attributes"];
}) {
  const { t } = useLocale();
  return (
    <button
      type="button"
      className="inline-flex items-center justify-center w-4 h-4 shrink-0 rounded text-zinc-300 dark:text-slate-600 hover:text-zinc-500 dark:hover:text-slate-400 cursor-grab active:cursor-grabbing"
      aria-label={t("table.reorderColumnHint")}
      title={t("table.reorderColumnHint")}
      {...attributes}
      {...listeners}
      onClick={(e) => e.stopPropagation()}
    >
      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
        <circle cx="5" cy="4" r="1.2" /><circle cx="11" cy="4" r="1.2" />
        <circle cx="5" cy="8" r="1.2" /><circle cx="11" cy="8" r="1.2" />
        <circle cx="5" cy="12" r="1.2" /><circle cx="11" cy="12" r="1.2" />
      </svg>
    </button>
  );
}

function SortableColumnHeader({
  id,
  className,
  children,
  align = "left",
  dataTestId,
}: {
  id: TaskListColumnId;
  className?: string;
  children: ReactNode;
  align?: "left" | "center";
  dataTestId?: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    data: { type: "column" as const },
    /** Avoid layout-animation leftovers that stack stretched headers after drop. */
    animateLayoutChanges: () => false,
  });

  /** Translate only — Transform keeps dnd-kit scaleX and stretches header labels. */
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition: isDragging ? undefined : transition,
    opacity: isDragging ? 0.45 : 1,
    position: "relative",
    zIndex: isDragging ? 40 : undefined,
    backgroundColor: isDragging ? "var(--task-list-dnd-bg, rgb(255 255 255))" : undefined,
  };

  return (
    <th
      ref={setNodeRef}
      style={style}
      className={`${className ?? ""}${isDragging ? " task-list-col-dragging" : ""}`}
      data-testid={dataTestId}
    >
      <div
        className={`flex items-center gap-1 min-w-0 min-h-4 ${
          align === "center" ? "justify-center" : ""
        }`}
      >
        <ColumnDragHandle listeners={listeners} attributes={attributes} />
        <div
          className={`min-w-0 flex items-center ${
            align === "center" ? "" : "flex-1"
          }`}
        >
          {children}
        </div>
      </div>
    </th>
  );
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
  onPriorityChange,
  onEffortChange,
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
  const { uiV2 } = useUiV2();
  const { user, applyUser } = useAuth();
  const { toast } = useToast();
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const sorted = useMemo(() => sortTodos(todos, sortCol, sortDir, nowMs), [todos, sortCol, sortDir, nowMs]);

  const [displayOrder, setDisplayOrder] = useState<Todo[]>(sorted);
  useEffect(() => { setDisplayOrder(sorted); }, [sorted]);

  const [columnOrder, setColumnOrder] = useState<TaskListColumnId[]>(() =>
    sanitizeColumnOrder(user?.taskListColumnOrder ?? DEFAULT_TASK_LIST_COLUMNS),
  );
  const lastSyncedColumnOrderRef = useRef(columnOrder);
  const columnOrderSaveGenRef = useRef(0);
  const [visibleActions, setVisibleActions] = useState<TaskListActionId[]>(() =>
    readVisibleActions(),
  );

  useEffect(() => {
    if (!uiV2) return;
    setVisibleActions(readVisibleActions());
  }, [uiV2]);

  const handleVisibleActionsChange = useCallback((next: TaskListActionId[]) => {
    setVisibleActions(next);
    writeVisibleActions(next);
  }, []);

  useEffect(() => {
    const next = sanitizeColumnOrder(user?.taskListColumnOrder ?? DEFAULT_TASK_LIST_COLUMNS);
    setColumnOrder(next);
    lastSyncedColumnOrderRef.current = next;
  }, [user?.taskListColumnOrder]);

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
  const thLabel =
    "text-xs font-semibold leading-none text-zinc-600 dark:text-slate-400";
  const thBtn =
    `inline-flex items-center gap-0.5 ${thLabel} cursor-pointer select-none hover:text-zinc-900 dark:hover:text-slate-100 transition-colors`;
  const thPy = uiV2 ? "py-2" : "py-3";
  /** Meta cells match V1 `px-4`; widths come from `.task-list-col-*` in globals.css. */
  const thPad = `px-4 ${thPy}`;
  const metaCol = uiV2 ? "task-list-col-meta" : "w-24";
  const thBase = `text-left ${thLabel}`;
  const thMeta = `text-center ${thLabel}`;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const collisionDetection: CollisionDetection = useCallback((args) => {
    const activeType = args.active.data.current?.type as string | undefined;
    if (!activeType) return closestCenter(args);
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (c) => c.data.current?.type === activeType,
      ),
    });
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeType = active.data.current?.type as string | undefined;

    if (activeType === "column") {
      const activeId = String(active.id) as TaskListColumnId;
      const overId = String(over.id) as TaskListColumnId;
      setColumnOrder((prev) => {
        const oldIdx = prev.indexOf(activeId);
        const newIdx = prev.indexOf(overId);
        if (oldIdx === -1 || newIdx === -1) return prev;
        const next = arrayMove(prev, oldIdx, newIdx);
        const gen = ++columnOrderSaveGenRef.current;
        void updateProfile({ taskListColumnOrder: next })
          .then((me) => {
            applyUser(me);
            lastSyncedColumnOrderRef.current = sanitizeColumnOrder(
              me.taskListColumnOrder ?? next,
            );
          })
          .catch(() => {
            if (gen !== columnOrderSaveGenRef.current) return;
            setColumnOrder(lastSyncedColumnOrderRef.current);
            toast.error(t("table.columnOrderSaveError"));
          });
        return next;
      });
      return;
    }

    setDisplayOrder((prev) => {
      const oldIdx = prev.findIndex((row) => row.id === active.id);
      const newIdx = prev.findIndex((row) => row.id === (over.id as string));
      if (oldIdx === -1 || newIdx === -1) return prev;
      const next = arrayMove(prev, oldIdx, newIdx);
      onReorder?.(next.map((row) => row.id));
      return next;
    });
  }, [onReorder, applyUser, t, toast]);

  const sortableIds = useMemo(() => displayOrder.map((row) => row.id), [displayOrder]);

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

  const canBulkDelete = useMemo(() => {
    if (!meUid || selectedTodos.length === 0) return false;
    return selectedTodos.some((row) => row.userId === meUid);
  }, [meUid, selectedTodos]);

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

  const renderColumnHeader = (col: TaskListColumnId) => {
    switch (col) {
      case "actions":
        return (
          <SortableColumnHeader
            key={col}
            id={col}
            className={`${uiV2 ? "task-list-col-actions" : "w-16"} pl-2 pr-0.5 ${thPy} ${thBase}`}
          >
            <span className="inline-flex items-center gap-1 min-w-0">
              <span className={thLabel}>{t("table.actions")}</span>
              {uiV2 && (
                <ActionsVisibilityPicker
                  visible={visibleActions}
                  onChange={handleVisibleActionsChange}
                />
              )}
            </span>
          </SortableColumnHeader>
        );
      case "title":
        return (
          <SortableColumnHeader
            key={col}
            id={col}
            className={`${uiV2 ? "task-list-col-title" : ""} pl-2 pr-4 ${thPy} ${thBase}`}
          >
            <span className={thLabel}>{t("table.title")}</span>
          </SortableColumnHeader>
        );
      case "priority":
        return (
          <SortableColumnHeader
            key={col}
            id={col}
            align="center"
            className={`${thPad} ${thMeta} ${metaCol}`}
            dataTestId="task-list-col-priority"
          >
            <button type="button" className={thBtn} onClick={() => onSort("priority")}>
              {t("table.priority")} <SortArrow col="priority" activeCol={sortCol} dir={sortDir} />
            </button>
          </SortableColumnHeader>
        );
      case "effort":
        return (
          <SortableColumnHeader
            key={col}
            id={col}
            align="center"
            className={`${thPad} ${thMeta} ${metaCol}`}
            dataTestId="task-list-col-effort"
          >
            <span className={thLabel}>{t("table.effort")}</span>
          </SortableColumnHeader>
        );
      case "deadline":
        return (
          <SortableColumnHeader
            key={col}
            id={col}
            align="center"
            className={`${thPad} ${thMeta} ${metaCol}`}
            dataTestId="task-list-col-deadline"
          >
            <button type="button" className={thBtn} onClick={() => onSort("deadline")}>
              {t("table.deadline")} <SortArrow col="deadline" activeCol={sortCol} dir={sortDir} />
            </button>
          </SortableColumnHeader>
        );
      case "classification":
        return (
          <SortableColumnHeader
            key={col}
            id={col}
            align="center"
            className={`${thPad} ${thMeta} ${metaCol}`}
            dataTestId="task-list-col-focus"
          >
            <button type="button" className={thBtn} onClick={() => onSort("classification")}>
              {t("table.classification")} <SortArrow col="classification" activeCol={sortCol} dir={sortDir} />
            </button>
          </SortableColumnHeader>
        );
      default:
        return null;
    }
  };

  return (
    <div>
      <div
        className={
          uiV2
            ? "bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-zinc-200 dark:border-slate-700 overflow-x-auto px-2 pb-1"
            : "bg-white dark:bg-slate-900 rounded-md shadow-sm border border-zinc-200 dark:border-slate-700 overflow-x-auto"
        }
      >
        <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragEnd={handleDragEnd}>
          <table
            className={`w-full text-sm ${uiV2 ? "task-list-v2" : "min-w-[676px]"}`}
            data-testid="task-list"
          >
            <thead>
              <tr className={uiV2 ? "bg-transparent" : "border-b border-zinc-200 dark:border-slate-700 bg-zinc-50/80 dark:bg-slate-800/80"}>
                <th className={`w-8 px-1 ${thPy}`} />
                {uiV2 && (
                  <th className={`w-9 px-0.5 ${thPy}`}>
                    <span className="sr-only">{t("a11y.complete")}</span>
                  </th>
                )}
                <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
                  {columnOrder.map((col) => renderColumnHeader(col))}
                </SortableContext>
                <th className={`w-10 px-1 ${thPy} text-center font-semibold text-zinc-600 dark:text-slate-400 text-xs`}>
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
              <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                {selectedCount > 0 && (
                  <tr className="border-b border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/90 dark:bg-emerald-950/35">
                    <td colSpan={uiV2 ? 9 : 8} className="px-3 py-2">
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
                          disabled={!canBulkDelete}
                          title={!canBulkDelete ? t("bulk.deleteNoOwnedInSelection") : undefined}
                          className="inline-flex items-center justify-center shrink-0 text-xs font-medium whitespace-nowrap px-2.5 py-1 rounded-md bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors disabled:opacity-50"
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
                    <td colSpan={uiV2 ? 9 : 8} className="text-center py-10 text-zinc-400 italic">
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
                      onPriorityChange={onPriorityChange}
                      onEffortChange={onEffortChange}
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
                      columnOrder={columnOrder}
                      visibleActions={visibleActions}
                    />
                  ))
                )}
              </SortableContext>
            </tbody>
          </table>
        </DndContext>
      </div>
    </div>
  );
}
