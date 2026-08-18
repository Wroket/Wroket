"use client";

import { useMemo } from "react";

import SlotPicker from "@/components/SlotPicker";
import type { Project, Todo } from "@/lib/api";
import { getPhaseSlotDateBounds } from "@/lib/phaseSlotBounds";

export interface PageScheduleModalProps {
  todo: Todo | null;
  projects?: Project[];
  onClose: () => void;
  onBooked: (updated: Todo) => void;
  onCleared?: (updated: Todo) => void;
  analyticsSource?: string;
}

/**
 * Opens SlotPicker as a page-level modal so booking never navigates away
 * from Mes tâches / Projet / Dashboard.
 */
export default function PageScheduleModal({
  todo,
  projects = [],
  onClose,
  onBooked,
  onCleared,
  analyticsSource = "page_schedule_modal",
}: PageScheduleModalProps) {
  const bounds = useMemo(
    () => (todo ? getPhaseSlotDateBounds(todo, projects) : {}),
    [todo, projects],
  );

  if (!todo) return null;

  return (
    <SlotPicker
      key={todo.id}
      todoId={todo.id}
      scheduledSlot={todo.scheduledSlot ?? null}
      suggestedSlot={todo.suggestedSlot}
      pageModal
      onDismiss={onClose}
      onBooked={(updated) => {
        onBooked(updated);
        onClose();
      }}
      onCleared={(updated) => {
        if (onCleared) onCleared(updated);
        else onBooked(updated);
      }}
      dateMin={bounds.min ?? todo.startDate ?? undefined}
      dateMax={bounds.max ?? todo.deadline ?? undefined}
      analyticsSource={analyticsSource}
    />
  );
}
