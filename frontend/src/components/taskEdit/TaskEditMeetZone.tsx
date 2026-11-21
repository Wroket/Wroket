"use client";

import { useLocale } from "@/lib/LocaleContext";
import { useAuth } from "@/components/AuthContext";
import type { Todo } from "@/lib/api";
import MeetOptionsForm from "@/components/MeetOptionsForm";

export interface TaskEditMeetZoneProps {
  className: string;
  todo: Todo;
  isTaskOwner: boolean;
  viewOnly?: boolean;
  /** When false, show unavailable hint (parent cannot run meet APIs). */
  meetEnabled?: boolean;
  onUpdated: (todo: Todo) => void;
}

export default function TaskEditMeetZone({
  className,
  todo,
  isTaskOwner,
  viewOnly = false,
  meetEnabled = true,
  onUpdated,
}: TaskEditMeetZoneProps) {
  const { t } = useLocale();
  const { user } = useAuth();
  const timeZone = user?.workingHours?.timezone ?? "UTC";

  if (!meetEnabled || viewOnly || !isTaskOwner) {
    return (
      <div id="zone-meet" className={className}>
        <p className="text-sm text-zinc-500 dark:text-slate-400">{t("uiV2.meetUnavailable")}</p>
      </div>
    );
  }

  return (
    <div id="zone-meet" className={className}>
      <MeetOptionsForm todo={todo} timeZone={timeZone} variant="embedded" onUpdated={onUpdated} />
    </div>
  );
}
