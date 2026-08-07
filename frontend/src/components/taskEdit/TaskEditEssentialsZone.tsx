"use client";

import { SoftLockHint, PlanBadge } from "@/components/SoftLock";
import { meetingJoinI18nKey } from "@/lib/meetingJoinLabel";
import { useLocale } from "@/lib/LocaleContext";
import type { Todo, Priority, Effort } from "@/lib/api";
import type { TaskEditModalProps } from "./types";

export interface TaskEditEssentialsZoneProps {
  className: string;
  todo: Todo;
  form: TaskEditModalProps["form"];
  onFormChange: TaskEditModalProps["onFormChange"];
  isTaskOwner: boolean;
  viewOnly: boolean;
  canSyncToCalendar: boolean;
  slotPushRunning: boolean;
  onPushSlotToCalendar: () => void;
  onManageMeet?: (todo: Todo) => void;
}

export default function TaskEditEssentialsZone({
  className,
  todo,
  form,
  onFormChange,
  isTaskOwner,
  viewOnly,
  canSyncToCalendar,
  slotPushRunning,
  onPushSlotToCalendar,
  onManageMeet,
}: TaskEditEssentialsZoneProps) {
  const { t } = useLocale();

  return (
    <div id="zone-essentials" className={className}>
      {isTaskOwner &&
        !viewOnly &&
        todo.scheduledSlot?.start &&
        todo.scheduledSlot?.end &&
        !todo.scheduledSlot?.calendarEventId && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:border-blue-800/60 dark:bg-blue-950/35 dark:text-blue-100">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="font-medium inline-flex items-center gap-2">
              {t("agenda.inAppSlotsSyncTaskButton")}
              {!canSyncToCalendar && <PlanBadge tier="small" />}
            </span>
            <button
              type="button"
              disabled={slotPushRunning || !canSyncToCalendar}
              title={!canSyncToCalendar ? t("planRequired.small") : undefined}
              onClick={() => {
                if (!canSyncToCalendar) return;
                onPushSlotToCalendar();
              }}
              className="shrink-0 rounded border border-blue-300 dark:border-blue-600 bg-white/90 dark:bg-slate-900/50 px-2.5 py-1 text-[11px] font-medium hover:bg-blue-100/80 dark:hover:bg-blue-950/50 disabled:opacity-50"
            >
              {slotPushRunning ? "…" : t("agenda.inAppSlotsSyncTaskPush")}
            </button>
          </div>
          {!canSyncToCalendar && <SoftLockHint tier="small" className="mt-1" />}
        </div>
      )}
      {todo.scheduledSlot?.meetingUrl && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-200">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{t("meet.scheduledIndicator")}</span>
            <div className="flex items-center gap-2">
              {onManageMeet && (
                <button
                  type="button"
                  onClick={() => onManageMeet(todo)}
                  className="rounded border border-emerald-300 dark:border-emerald-700 px-2 py-0.5 text-[11px] hover:bg-emerald-100/70 dark:hover:bg-emerald-900/30"
                >
                  {t("meet.editMeet")}
                </button>
              )}
              <a
                href={todo.scheduledSlot.meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:opacity-80"
                title={t(meetingJoinI18nKey(todo.scheduledSlot.meetingProvider))}
              >
                {t(meetingJoinI18nKey(todo.scheduledSlot.meetingProvider))}
              </a>
            </div>
          </div>
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
          {t("edit.titleField")}
        </label>
        {todo.externalRef?.provider === "notion" && (
          <p className="text-[10px] text-amber-700 dark:text-amber-400 mb-1">{t("tasks.managedByNotion")}</p>
        )}
        <input
          type="text"
          value={form.title}
          onChange={(e) => onFormChange({ title: e.target.value })}
          autoFocus
          className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
            {t("edit.priority")}
          </label>
          <select
            value={form.priority}
            onChange={(e) => onFormChange({ priority: e.target.value as Priority })}
            className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400"
          >
            <option value="high">{t("priority.high")}</option>
            <option value="medium">{t("priority.medium")}</option>
            <option value="low">{t("priority.low")}</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
            {t("edit.effort")}
          </label>
          <select
            value={form.effort}
            onChange={(e) => onFormChange({ effort: e.target.value as Effort })}
            className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400"
          >
            <option value="light">{t("effort.light")}</option>
            <option value="medium">{t("effort.medium")}</option>
            <option value="heavy">{t("effort.heavy")}</option>
          </select>
        </div>
      </div>
    </div>
  );
}
