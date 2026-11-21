"use client";

import { useLocale } from "@/lib/LocaleContext";
import type { Todo } from "@/lib/api";
import SlotPicker from "@/components/SlotPicker";

export interface TaskEditScheduleZoneProps {
  className: string;
  todo: Todo;
  /** Date bounds for slot suggestions (task start/deadline). */
  dateMin?: string;
  dateMax?: string;
  isTaskOwner: boolean;
  freeTierContentLocks: boolean;
  onScheduleUpdate?: (todo: Todo) => void;
}

/**
 * Calendar booking only — same Suggestions / Manual UI as the Schedule button modal.
 * Dates / recurrence live in Planning.
 */
export default function TaskEditScheduleZone({
  className,
  todo,
  dateMin,
  dateMax,
  isTaskOwner,
  freeTierContentLocks: _freeTierContentLocks,
  onScheduleUpdate,
}: TaskEditScheduleZoneProps) {
  void _freeTierContentLocks;
  const { t } = useLocale();

  if (!isTaskOwner || !onScheduleUpdate) {
    return (
      <div id="zone-schedule" className={className}>
        <p className="text-sm text-zinc-500 dark:text-slate-400">{t("schedule.title")}</p>
      </div>
    );
  }

  return (
    <div id="zone-schedule" className={className}>
      <SlotPicker
        key={todo.id}
        todoId={todo.id}
        scheduledSlot={todo.scheduledSlot ?? null}
        suggestedSlot={todo.suggestedSlot}
        preferredBookingTarget={todo.preferredBookingTarget ?? null}
        embeddedPanel
        onBooked={onScheduleUpdate}
        onCleared={onScheduleUpdate}
        dateMin={dateMin}
        dateMax={dateMax}
        analyticsSource="task_edit_schedule"
      />
    </div>
  );
}
