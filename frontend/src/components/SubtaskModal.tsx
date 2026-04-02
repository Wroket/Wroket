"use client";

import { useEffect, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { useLocale } from "@/lib/LocaleContext";
import { useFocusTrap } from "@/lib/useFocusTrap";
import type { Todo, Priority, Effort } from "@/lib/api";
import type { TranslationKey } from "@/lib/i18n";
import { PRIORITY_BADGES } from "@/lib/todoConstants";

export interface SubtaskModalProps {
  parent: Todo | null;
  onClose: () => void;
  onCreateSubtask: (data: {
    title: string;
    priority: Priority;
    effort: Effort;
    deadline: string;
  }) => void;
  creating: boolean;
  existingSubtasks: Todo[];
  onCompleteSubtask: (todo: Todo) => void;
  onDeleteSubtask: (todo: Todo) => void;
  onPromoteSubtask?: (todo: Todo) => void;
  onReorderSubtasks?: (orderedIds: string[]) => void;
}

function SortableSubtaskItem({
  sub,
  onComplete,
  onPromote,
  t,
}: {
  sub: Todo;
  onComplete: (todo: Todo) => void;
  onPromote?: (todo: Todo) => void;
  t: (key: TranslationKey) => string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sub.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(
      transform ? { ...transform, scaleX: 1, scaleY: 1 } : null,
    ),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const badge = PRIORITY_BADGES[sub.priority];

  return (
    <li ref={setNodeRef} style={style} className="flex items-center gap-1.5 text-sm">
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-zinc-300 dark:text-slate-600 hover:text-zinc-500 dark:hover:text-slate-400 touch-none shrink-0 p-0.5"
        {...attributes}
        {...listeners}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16M4 16h16" />
        </svg>
      </button>
      <button
        onClick={() => onComplete(sub)}
        className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
          sub.status === "completed"
            ? "bg-green-500 border-green-500 text-white"
            : "border-zinc-300 dark:border-slate-500 hover:border-green-500 text-transparent hover:text-green-500"
        }`}
      >
        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </button>
      <span
        className={`flex-1 truncate ${
          sub.status === "completed"
            ? "line-through text-zinc-400"
            : "text-zinc-700 dark:text-slate-300"
        }`}
      >
        {sub.title}
      </span>
      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${badge.cls}`}>
        {t(badge.tKey)}
      </span>
      {onPromote && (
        <button
          type="button"
          onClick={() => onPromote(sub)}
          title={t("subtask.promote")}
          className="text-zinc-400 hover:text-orange-500 transition-colors p-0.5 shrink-0"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.181 8.68a4.503 4.503 0 011.903 6.405m-9.768-2.782L3.56 14.06a4.5 4.5 0 006.364 6.365l.707-.707m6.062-9.192l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-.707.707" />
          </svg>
        </button>
      )}
    </li>
  );
}

export default function SubtaskModal({
  parent,
  onClose,
  onCreateSubtask,
  creating,
  existingSubtasks,
  onCompleteSubtask,
  onDeleteSubtask,
  onPromoteSubtask,
  onReorderSubtasks,
}: SubtaskModalProps) {
  const { t } = useLocale();
  const trapRef = useFocusTrap(!!parent);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [effort, setEffort] = useState<Effort>("medium");
  const [deadline, setDeadline] = useState("");

  void onDeleteSubtask;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  useEffect(() => {
    if (!parent) return;
    setTitle("");
    setPriority("medium");
    setEffort("medium");
    setDeadline("");
  }, [parent]);

  useEffect(() => {
    if (!parent) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [parent, onClose]);

  if (!parent) return null;

  const handleSubmit = () => {
    if (!title.trim()) return;
    onCreateSubtask({ title, priority, effort, deadline });
    setTitle("");
    setPriority("medium");
    setEffort("medium");
    setDeadline("");
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorderSubtasks) return;
    const oldIndex = existingSubtasks.findIndex((s) => s.id === active.id);
    const newIndex = existingSubtasks.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(existingSubtasks, oldIndex, newIndex);
    onReorderSubtasks(reordered.map((s) => s.id));
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="subtask-modal-title"
        className="bg-white dark:bg-slate-900 rounded-lg shadow-2xl border border-zinc-200 dark:border-slate-700 w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          id="subtask-modal-title"
          className="text-lg font-semibold text-zinc-900 dark:text-slate-100 mb-1"
        >
          {t("subtask.add")}
        </h3>
        <p className="text-xs text-zinc-400 dark:text-slate-500 mb-4 truncate">
          ↳ {parent.title}
        </p>

        {existingSubtasks.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={existingSubtasks.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-1.5 mb-4 max-h-60 overflow-y-auto">
                {existingSubtasks.map((sub) => (
                  <SortableSubtaskItem
                    key={sub.id}
                    sub={sub}
                    onComplete={onCompleteSubtask}
                    onPromote={onPromoteSubtask}
                    t={t}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}

        <div className="space-y-3">
          <input
            type="text"
            placeholder={t("subtask.placeholder")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && title.trim()) handleSubmit();
              if (e.key === "Escape") onClose();
            }}
            autoFocus
            className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400"
          />
          <div className="grid grid-cols-3 gap-2">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="rounded border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-xs text-zinc-900 dark:text-slate-100 dark:bg-slate-800"
            >
              <option value="high">{t("priority.high")}</option>
              <option value="medium">{t("priority.medium")}</option>
              <option value="low">{t("priority.low")}</option>
            </select>
            <select
              value={effort}
              onChange={(e) => setEffort(e.target.value as Effort)}
              className="rounded border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-xs text-zinc-900 dark:text-slate-100 dark:bg-slate-800"
            >
              <option value="light">{t("effort.light")}</option>
              <option value="medium">{t("effort.medium")}</option>
              <option value="heavy">{t("effort.heavy")}</option>
            </select>
            <input
              type="date"
              value={deadline}
              min={new Date().toISOString().split("T")[0]}
              onChange={(e) => setDeadline(e.target.value)}
              max={parent.deadline || undefined}
              className="rounded border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-xs text-zinc-900 dark:text-slate-100 dark:bg-slate-800"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-green-300 dark:border-green-700 px-4 py-2 text-sm font-medium text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/40 transition-colors"
          >
            {t("subtask.done")}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={creating || !title.trim()}
            className="rounded bg-slate-700 dark:bg-slate-600 px-5 py-2 text-sm font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-60 transition-colors"
          >
            {creating ? t("subtask.adding") : t("subtask.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
