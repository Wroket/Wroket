"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "@/lib/LocaleContext";
import { useAuth } from "@/components/AuthContext";
import type { PreferredBookingTarget, Todo } from "@/lib/api";
import SlotPicker from "@/components/SlotPicker";
import {
  bookingTargetKey,
  findBookableOption,
  formatBookableLabel,
  getBookableCalendarsFromUser,
} from "@/lib/bookableCalendars";
import { updateTodo } from "@/lib/api/todos";
import { formatUserFacingError } from "@/lib/apiErrors";
import { useToast } from "@/components/Toast";

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
 * Calendar booking only — dates / recurrence live in Planning.
 */
export default function TaskEditScheduleZone({
  className,
  todo,
  dateMin,
  dateMax,
  isTaskOwner,
  freeTierContentLocks,
  onScheduleUpdate,
}: TaskEditScheduleZoneProps) {
  const { t } = useLocale();
  const { user } = useAuth();
  const { toast } = useToast();
  const bookableCalendars = useMemo(() => getBookableCalendarsFromUser(user), [user]);
  const initialOpt = useMemo(
    () => findBookableOption(bookableCalendars, todo.preferredBookingTarget ?? null),
    [bookableCalendars, todo.preferredBookingTarget],
  );
  const [calendarKey, setCalendarKey] = useState(() =>
    initialOpt ? bookingTargetKey(initialOpt) : "",
  );
  const [savingTarget, setSavingTarget] = useState(false);

  useEffect(() => {
    const opt = findBookableOption(bookableCalendars, todo.preferredBookingTarget ?? null);
    setCalendarKey(opt ? bookingTargetKey(opt) : "");
  }, [todo.id, todo.preferredBookingTarget, bookableCalendars]);

  const handleCalendarChange = async (key: string) => {
    setCalendarKey(key);
    const selected = bookableCalendars.find((c) => bookingTargetKey(c) === key);
    if (!selected || !isTaskOwner) return;
    const preferredBookingTarget: PreferredBookingTarget = {
      provider: selected.provider,
      accountId: selected.accountId,
      calendarId: selected.calendarId,
    };
    setSavingTarget(true);
    try {
      const updated = await updateTodo(todo.id, { preferredBookingTarget });
      onScheduleUpdate?.(updated);
    } catch (e) {
      toast.error(formatUserFacingError(e, "toast.updateError"));
    } finally {
      setSavingTarget(false);
    }
  };

  if (!isTaskOwner || !onScheduleUpdate) {
    return (
      <div id="zone-schedule" className={className}>
        <p className="text-sm text-zinc-500 dark:text-slate-400">{t("schedule.title")}</p>
      </div>
    );
  }

  return (
    <div id="zone-schedule" className={className}>
      <div className="rounded-md border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-3">
        <p className="text-xs font-medium text-zinc-600 dark:text-slate-300 mb-2">{t("schedule.title")}</p>
        {bookableCalendars.length > 0 && (
          <label className="mb-2 block">
            <span className="text-[11px] font-medium text-zinc-500 dark:text-slate-400">
              {t("agenda.wroketCalendar")}
            </span>
            <select
              value={calendarKey}
              onChange={(e) => void handleCalendarChange(e.target.value)}
              disabled={savingTarget || freeTierContentLocks}
              className="mt-0.5 w-full rounded border border-zinc-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs text-zinc-800 dark:text-slate-100 disabled:opacity-50"
            >
              {bookableCalendars.map((opt) => (
                <option key={bookingTargetKey(opt)} value={bookingTargetKey(opt)}>
                  {formatBookableLabel(opt)}
                </option>
              ))}
            </select>
          </label>
        )}
        <SlotPicker
          todoId={todo.id}
          scheduledSlot={todo.scheduledSlot ?? null}
          suggestedSlot={todo.suggestedSlot}
          preferredBookingTarget={todo.preferredBookingTarget ?? null}
          onBooked={onScheduleUpdate}
          onCleared={onScheduleUpdate}
          dateMin={dateMin}
          dateMax={dateMax}
        />
        <Link
          href={`/agenda?schedule=${encodeURIComponent(todo.id)}`}
          className="mt-2 inline-flex text-[11px] font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
        >
          {t("schedule.openInAgenda")}
        </Link>
      </div>
    </div>
  );
}
