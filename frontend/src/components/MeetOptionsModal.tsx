"use client";

import type { Todo } from "@/lib/api";
import MeetOptionsForm from "@/components/MeetOptionsForm";
import ViewportOverlay, { sheetPanelClass } from "@/components/ui/ViewportOverlay";
import { useNarrowVisualViewport } from "@/hooks/useVisualViewportRect";

export interface MeetOptionsModalProps {
  todo: Todo | null;
  timeZone: string;
  onClose: () => void;
  onUpdated: (todo: Todo) => void;
}

/**
 * Page-level meet create/edit overlay (row actions).
 */
export default function MeetOptionsModal({ todo, timeZone, onClose, onUpdated }: MeetOptionsModalProps) {
  const narrow = useNarrowVisualViewport(!!todo);
  if (!todo) return null;

  return (
    <ViewportOverlay open onClose={onClose} zClassName="z-[100]">
      <div
        className={sheetPanelClass(
          narrow,
          "relative bg-white dark:bg-slate-900 rounded-lg shadow-2xl border border-zinc-200 dark:border-slate-700 w-full max-w-lg mx-4 p-5",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <MeetOptionsForm
          todo={todo}
          timeZone={timeZone}
          variant="modal"
          onDismiss={onClose}
          onUpdated={onUpdated}
        />
      </div>
    </ViewportOverlay>
  );
}
