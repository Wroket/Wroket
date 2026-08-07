"use client";

import { useLocale } from "@/lib/LocaleContext";
import type { Todo, RecurrenceFrequency, SuggestedSlot } from "@/lib/api";
import type { TaskEditModalProps } from "./types";

export interface TaskEditPlanningZoneProps {
  className: string;
  todo: Todo;
  form: TaskEditModalProps["form"];
  onFormChange: TaskEditModalProps["onFormChange"];
  isTaskOwner: boolean;
  freeTierContentLocks: boolean;
  deadlineIsPast: boolean;
  phaseDateRange: { start: string | null; end: string | null };
  sortedProjectOptions: { id: string; label: string }[];
  effortDefaults?: { light: number; medium: number; heavy: number };
  onSuggestedSlotChange?: (slot: SuggestedSlot | null) => void;
  showSuggestSlot: boolean;
  onShowSuggestSlotChange: (show: boolean) => void;
  suggestDate: string;
  onSuggestDateChange: (date: string) => void;
  suggestTime: string;
  onSuggestTimeChange: (time: string) => void;
  suggestDuration: number;
  onSuggestDurationChange: (duration: number) => void;
}

export default function TaskEditPlanningZone({
  className,
  todo,
  form,
  onFormChange,
  isTaskOwner,
  freeTierContentLocks,
  deadlineIsPast,
  phaseDateRange,
  sortedProjectOptions,
  effortDefaults,
  onSuggestedSlotChange,
  showSuggestSlot,
  onShowSuggestSlotChange,
  suggestDate,
  onSuggestDateChange,
  suggestTime,
  onSuggestTimeChange,
  suggestDuration,
  onSuggestDurationChange,
}: TaskEditPlanningZoneProps) {
  const { t } = useLocale();

  return (
    <>
      <div id="zone-planning" className={className}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
              {t("edit.startDate")}
            </label>
            <input
              type="date"
              value={form.startDate}
              min={phaseDateRange.start ?? undefined}
              max={form.deadline || phaseDateRange.end || undefined}
              onChange={(e) => onFormChange({ startDate: e.target.value })}
              className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
              {t("edit.deadline")}
            </label>
            {isTaskOwner ? (
              <input
                type="date"
                value={form.deadline}
                min={form.startDate || phaseDateRange.start || new Date().toISOString().split("T")[0]}
                max={phaseDateRange.end ?? undefined}
                onChange={(e) => onFormChange({ deadline: e.target.value })}
                className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400"
              />
            ) : (
              <div className="w-full rounded border border-zinc-200 dark:border-slate-700 bg-zinc-50 dark:bg-slate-800/50 px-3 py-2 text-sm text-zinc-600 dark:text-slate-400 cursor-not-allowed" title={t("assign.deadlineOwnerOnly")}>
                {form.deadline || "—"}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
              {t("todos.estimatedTime")}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={480}
                step={5}
                value={form.estimatedMinutes ?? ""}
                placeholder={String(effortDefaults?.[form.effort] ?? "")}
                onChange={(e) => {
                  const v = e.target.value;
                  onFormChange({ estimatedMinutes: v === "" ? null : Math.max(1, Math.min(480, Number(v) || 1)) });
                }}
                className="w-20 rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400 text-center"
              />
              <span className="text-xs text-zinc-400 dark:text-slate-500">{t("todos.estimatedMinutes")}</span>
              {form.estimatedMinutes !== null && (
                <button
                  type="button"
                  onClick={() => onFormChange({ estimatedMinutes: null })}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  {t("todos.useDefault")}
                </button>
              )}
            </div>
          </div>
          {sortedProjectOptions.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
              {t("projects.project")}
            </label>
            <select
              value={form.projectId ?? ""}
              onChange={(e) => onFormChange({ projectId: e.target.value || null })}
              className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400"
            >
              <option value="">{t("projects.noProject")}</option>
              {sortedProjectOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>
          )}
        </div>
      </div>

      <div className={className}>
        {isTaskOwner && form.assignedTo && onSuggestedSlotChange && (
          <div className="rounded-md border border-zinc-200 dark:border-slate-700 p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-zinc-600 dark:text-slate-300">{t("schedule.suggestSlot")}</span>
              {todo?.suggestedSlot && (
                <button type="button" onClick={() => { onSuggestedSlotChange(null); }} className="text-[10px] text-red-500 hover:underline">{t("schedule.clearSuggestion")}</button>
              )}
            </div>
            {todo?.suggestedSlot && !showSuggestSlot ? (
              <div className="flex items-center justify-between rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-2.5 py-2 mt-1">
                <div>
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">{t("schedule.suggestedByOwner")}</p>
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                    {new Date(todo.suggestedSlot.start).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}{", "}
                    {new Date(todo.suggestedSlot.start).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <button type="button" onClick={() => onShowSuggestSlotChange(true)} className="text-xs text-amber-700 dark:text-amber-300 hover:underline">{t("projects.edit")}</button>
              </div>
            ) : (
              <div className="space-y-2 mt-1">
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={suggestDate}
                    min={phaseDateRange.start ?? new Date().toISOString().split("T")[0]}
                    max={phaseDateRange.end ?? undefined}
                    onChange={(e) => onSuggestDateChange(e.target.value)}
                    className="flex-1 rounded border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-sm dark:bg-slate-800 dark:text-slate-100"
                  />
                  <input
                    type="time"
                    value={suggestTime}
                    onChange={(e) => onSuggestTimeChange(e.target.value)}
                    className="w-24 rounded border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-sm dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-zinc-500 dark:text-slate-400">{t("schedule.duration")}:</label>
                  <input type="number" value={suggestDuration} min={5} max={480} step={5} onChange={(e) => onSuggestDurationChange(Number(e.target.value) || 30)} className="w-16 rounded border border-zinc-300 dark:border-slate-600 px-2 py-1 text-xs dark:bg-slate-800 dark:text-slate-100 text-center" />
                  <span className="text-[10px] text-zinc-400 dark:text-slate-500">min</span>
                  <button
                    type="button"
                    disabled={!suggestDate}
                    onClick={() => {
                      const start = new Date(`${suggestDate}T${suggestTime}`);
                      const end = new Date(start.getTime() + suggestDuration * 60_000);
                      onSuggestedSlotChange({ start: start.toISOString(), end: end.toISOString() });
                      onShowSuggestSlotChange(false);
                    }}
                    className="ml-auto rounded bg-amber-600 dark:bg-amber-700 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 dark:hover:bg-amber-600 disabled:opacity-50 transition-colors"
                  >
                    {t("schedule.suggestSlot")}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Recurrence */}
        <div className="rounded border border-zinc-200 dark:border-slate-700 p-3 space-y-2">
          <label
            className={
              "flex items-center gap-2 " +
              (deadlineIsPast || !isTaskOwner || freeTierContentLocks ? "cursor-not-allowed opacity-70" : "cursor-pointer")
            }
          >
            <input
              type="checkbox"
              checked={!!form.recurrence}
              disabled={deadlineIsPast || !isTaskOwner || freeTierContentLocks}
              onChange={(e) => {
                if (deadlineIsPast || !isTaskOwner || freeTierContentLocks) return;
                if (e.target.checked) {
                  onFormChange({ recurrence: { frequency: "weekly", interval: 1 } });
                } else {
                  onFormChange({ recurrence: null });
                }
              }}
              className="rounded border-zinc-300 dark:border-slate-600 text-slate-700 focus:ring-slate-500 disabled:opacity-50"
            />
            <span className="text-xs font-medium text-zinc-700 dark:text-slate-300">
              🔄 {t("edit.recurrenceEnabled")}
            </span>
          </label>
          {freeTierContentLocks && isTaskOwner && (
            <p className="text-[10px] text-amber-700 dark:text-amber-300/90">{t("quota.free.recurrenceDisabled")}</p>
          )}
          {deadlineIsPast && isTaskOwner && !freeTierContentLocks && (
            <p className="text-[10px] text-zinc-400 dark:text-slate-500">{t("edit.recurrenceNeedsDeadline")}</p>
          )}
          {form.recurrence && (
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-zinc-500 dark:text-slate-400 mb-0.5">
                  {t("edit.recurrence")}
                </label>
                <select
                  value={form.recurrence.frequency}
                  disabled={!isTaskOwner || freeTierContentLocks}
                  onChange={(e) => {
                    const freq = e.target.value as RecurrenceFrequency;
                    onFormChange({
                      recurrence: {
                        ...form.recurrence!,
                        frequency: freq,
                        interval: freq === "daily" ? 1 : form.recurrence!.interval,
                      },
                    });
                  }}
                  className="w-full rounded border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-xs text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-50"
                >
                  <option value="daily">{t("edit.recurrenceDaily")}</option>
                  <option value="weekly">{t("edit.recurrenceWeekly")}</option>
                  <option value="monthly">{t("edit.recurrenceMonthly")}</option>
                </select>
              </div>
              <div>
                <label className={`block text-[10px] mb-0.5 ${form.recurrence.frequency === "daily" ? "text-zinc-300 dark:text-slate-600" : "text-zinc-500 dark:text-slate-400"}`}>
                  {form.recurrence.frequency === "weekly"
                    ? t("edit.recurrenceIntervalWeeks")
                    : form.recurrence.frequency === "monthly"
                      ? t("edit.recurrenceIntervalMonths")
                      : t("edit.recurrenceIntervalDays")}
                </label>
                <input
                  type="number"
                  min={1}
                  max={form.recurrence.frequency === "weekly" ? 52 : form.recurrence.frequency === "monthly" ? 12 : 365}
                  disabled={form.recurrence.frequency === "daily" || !isTaskOwner || freeTierContentLocks}
                  value={form.recurrence.interval}
                  onChange={(e) =>
                    onFormChange({ recurrence: { ...form.recurrence!, interval: Math.max(1, Number(e.target.value) || 1) } })
                  }
                  className={`w-full rounded border px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-slate-500 ${
                    form.recurrence.frequency === "daily"
                      ? "border-zinc-200 dark:border-slate-700 bg-zinc-100 dark:bg-slate-900 text-zinc-400 dark:text-slate-600 cursor-not-allowed"
                      : "border-zinc-300 dark:border-slate-600 text-zinc-900 dark:text-slate-100 dark:bg-slate-800"
                  }`}
                />
              </div>
              <div>
                <label className="block text-[10px] text-zinc-500 dark:text-slate-400 mb-0.5">
                  {t("edit.recurrenceEnd")}
                </label>
                <input
                  type="date"
                  value={form.recurrence.endDate ?? ""}
                  min={new Date().toISOString().split("T")[0]}
                  disabled={!isTaskOwner || freeTierContentLocks}
                  onChange={(e) =>
                    onFormChange({ recurrence: { ...form.recurrence!, endDate: e.target.value || undefined } })
                  }
                  className="w-full rounded border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-xs text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-50"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
