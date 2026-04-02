"use client";

import {
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import {
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/* ─── Kanban DnD wrappers ─── */

export function DroppablePhaseColumn({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`flex-1 overflow-y-auto px-2 py-2 space-y-2 transition-colors ${isOver ? "bg-blue-50/50 dark:bg-blue-950/20 ring-2 ring-blue-400/40 ring-inset rounded" : ""}`}>
      {children}
    </div>
  );
}

export function DraggableKanbanCard({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={`touch-none ${isDragging ? "opacity-30" : ""}`}>
      {children}
    </div>
  );
}

/* ─── Sortable Project Card wrapper ─── */

interface SortableProjectCardProps {
  id: string;
  isNesting: boolean;
  children: React.ReactNode;
}

export function SortableProjectCard({ id, isNesting, children }: SortableProjectCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = isDragging
    ? { opacity: 0.3, transition }
    : {
        transform: isNesting ? undefined : CSS.Transform.toString(transform ? { ...transform, scaleX: 1, scaleY: 1 } : null),
        transition,
      };

  return (
    <div ref={setNodeRef} style={style} className="flex flex-col h-full">
      <div className="flex items-center gap-1 mb-1">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing text-zinc-300 dark:text-slate-600 hover:text-zinc-500 dark:hover:text-slate-400 touch-none"
          {...attributes}
          {...listeners}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16M4 16h16" />
          </svg>
        </button>
      </div>
      {children}
    </div>
  );
}

/* ─── Draggable Sub-project Card wrapper ─── */

export function DraggableSubProjectCard({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  return (
    <div ref={setNodeRef} className={`relative ${isDragging ? "opacity-30" : ""}`}>
      <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-5">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing text-zinc-300 dark:text-slate-600 hover:text-zinc-500 dark:hover:text-slate-400 touch-none"
          {...attributes}
          {...listeners}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16M4 16h16" />
          </svg>
        </button>
      </div>
      {children}
    </div>
  );
}
