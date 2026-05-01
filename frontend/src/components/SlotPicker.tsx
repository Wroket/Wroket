"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  getTaskSlots,
  bookTaskSlot,
  clearTaskSlot,
  type ScheduledSlot,
  type SuggestedSlot,
  type SlotProposal,
  type SlotConflict,
  type Todo,
} from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import { useToast } from "@/components/Toast";
import { formatScheduledSlotLabel } from "@/lib/slotFormat";

export interface SlotPickerProps {
  todoId: string;
  scheduledSlot: ScheduledSlot | null;
  suggestedSlot?: SuggestedSlot | null;
  onBooked: (todo: Todo) => void;
  onCleared: (todo: Todo) => void;
  autoOpen?: boolean;
  dateMin?: string;
  dateMax?: string;
}

export default function SlotPicker({ todoId, scheduledSlot, suggestedSlot, onBooked, onCleared, autoOpen, dateMin, dateMax }: SlotPickerProps) {
  const { t } = useLocale();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  /** After creating a task, show schedule UI as a centered modal; manual opens use the anchored popover. */
  const [presentation, setPresentation] = useState<"popover" | "modal">("popover");
  const autoOpenedRef = useRef(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (autoOpen && !autoOpenedRef.current && !scheduledSlot) {
      autoOpenedRef.current = true;
      setPresentation("modal");
      setOpen(true);
      fetchSlots();
    }
  }, [autoOpen, scheduledSlot]); // eslint-disable-line react-hooks/exhaustive-deps
  const [loading, setLoading] = useState(false);
  const [slots, setSlots] = useState<SlotProposal[]>([]);
  const [duration, setDuration] = useState(0);
  const [durationSource, setDurationSource] = useState<"task" | "settings">("settings");
  const [effort, setEffort] = useState("");
  const [serverSuggestedSlot, setServerSuggestedSlot] = useState<SuggestedSlot | null>(suggestedSlot ?? null);
  const [booking, setBooking] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [conflicts, setConflicts] = useState<SlotConflict[]>([]);
  const [pendingSlot, setPendingSlot] = useState<{ start: string; end: string } | null>(null);
  const [mode, setMode] = useState<"suggested" | "manual">("suggested");
  const [rescheduleMode, setRescheduleMode] = useState(false);
  const [manualDate, setManualDate] = useState("");
  const [manualTime, setManualTime] = useState("09:00");
  const ref = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  const computePosition = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const popW = 288;
    const popH = 320;
    const openBelow = (window.innerHeight - rect.bottom) >= popH;
    const openRight = (window.innerWidth - rect.left) >= popW;

    setPopoverStyle({
      position: "fixed",
      top: openBelow ? rect.bottom + 4 : undefined,
      bottom: openBelow ? undefined : (window.innerHeight - rect.top + 4),
      left: openRight ? rect.left : undefined,
      right: openRight ? undefined : (window.innerWidth - rect.right),
      zIndex: 9999,
    });
  }, []);

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTaskSlots(todoId);
      setSlots(data.slots);
      setDuration(data.duration);
      setDurationSource(data.durationSource);
      setEffort(data.effort);
      if (data.suggestedSlot) setServerSuggestedSlot(data.suggestedSlot);
    } catch {
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [todoId]);

  const handleOpen = () => {
    setPresentation("popover");
    computePosition();
    setOpen(true);
    setRescheduleMode(false);
    if (!scheduledSlot) fetchSlots();
  };

  const handleReschedule = async () => {
    setClearing(true);
    try {
      const updated = await clearTaskSlot(todoId);
      onCleared(updated);
      setRescheduleMode(true);
      setMode("suggested");
      fetchSlots();
    } catch {
      toast.error(t("toast.deleteError"));
    } finally {
      setClearing(false);
    }
  };

  const doBook = async (start: string, end: string, force?: boolean) => {
    setBooking(true);
    // Optimistic close for better perceived responsiveness.
    setOpen(false);
    try {
      const result = await bookTaskSlot(todoId, start, end, force);
      if (result.conflict && result.conflicts?.length) {
        setConflicts(result.conflicts);
        setPendingSlot({ start, end });
        setPresentation("modal");
        setOpen(true);
        return;
      }
      if (result.todo) {
        setConflicts([]);
        setPendingSlot(null);
        onBooked(result.todo);
        toast.success(t("schedule.booked"));
      }
    } catch {
      setPresentation("modal");
      setOpen(true);
      toast.error(t("toast.updateError"));
    } finally {
      setBooking(false);
    }
  };

  const handleBook = (slot: SlotProposal) => doBook(slot.start, slot.end);

  const handleManualBook = () => {
    if (!manualDate || !manualTime) return;
    const start = new Date(`${manualDate}T${manualTime}`);
    const end = new Date(start.getTime() + (duration || 30) * 60 * 1000);
    doBook(start.toISOString(), end.toISOString());
  };

  const handleForceBook = () => {
    if (!pendingSlot) return;
    doBook(pendingSlot.start, pendingSlot.end, true);
  };

  const handleDismissConflict = () => {
    setConflicts([]);
    setPendingSlot(null);
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      const updated = await clearTaskSlot(todoId);
      onCleared(updated);
      setOpen(false);
    } catch {
      toast.error(t("toast.deleteError"));
    } finally {
      setClearing(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    if (presentation === "popover") {
      const handleClick = (e: MouseEvent) => {
        if (ref.current && !ref.current.contains(e.target as Node)) {
          setOpen(false);
        }
      };
      document.addEventListener("mousedown", handleClick);
      return () => {
        document.removeEventListener("mousedown", handleClick);
        document.removeEventListener("keydown", handleKey);
      };
    }
    return () => {
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, presentation]);

  const formatSlotBadge = (slot: ScheduledSlot): string => `📅 ${formatScheduledSlotLabel(slot)}`;

  const panelShellClass =
    "bg-white dark:bg-slate-800 border border-zinc-200 dark:border-slate-600 rounded-lg shadow-xl w-72 max-w-[min(100vw-2rem,18rem)]";

  const renderScheduleBody = () => (
    <>
      <div className="px-4 py-3 border-b border-zinc-100 dark:border-slate-700">
        <div className="flex items-start justify-between gap-2">
          <h4 id="slot-picker-dialog-title" className="text-sm font-semibold text-zinc-900 dark:text-slate-100 flex-1 min-w-0">
            {t("schedule.title")}
          </h4>
          {presentation === "modal" && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="shrink-0 whitespace-nowrap rounded border border-zinc-200 dark:border-slate-600 px-2 py-1 text-[11px] font-medium text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
              aria-label={t("schedule.notNow")}
            >
              {t("schedule.notNow")}
            </button>
          )}
        </div>
            {(!scheduledSlot || rescheduleMode) && (
              <div className="flex gap-1 mt-2">
                <button
                  type="button"
                  onClick={() => setMode("suggested")}
                  className={`flex-1 text-[11px] font-medium rounded py-1 transition-colors ${mode === "suggested" ? "bg-slate-700 dark:bg-slate-600 text-white dark:text-slate-100" : "text-zinc-500 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-700"}`}
                >
                  {t("schedule.suggested")}
                </button>
                <button
                  type="button"
                  onClick={() => setMode("manual")}
                  className={`flex-1 text-[11px] font-medium rounded py-1 transition-colors ${mode === "manual" ? "bg-slate-700 dark:bg-slate-600 text-white dark:text-slate-100" : "text-zinc-500 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-700"}`}
                >
                  {t("schedule.manual")}
                </button>
              </div>
            )}
          </div>

          <div className="p-3">
            {conflicts.length > 0 && pendingSlot ? (
              <div className="space-y-3">
                <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1.5">
                    {t("schedule.conflictTitle")}
                  </p>
                  {conflicts.map((c) => (
                    <div key={c.id} className="flex items-center gap-1.5 text-[11px] text-amber-800 dark:text-amber-200 py-0.5">
                      <span className="shrink-0">⚠️</span>
                      <span className="truncate font-medium">{c.title}</span>
                      <span className="shrink-0 text-amber-600 dark:text-amber-400">
                        {new Date(c.start).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                        –{new Date(c.end).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleDismissConflict}
                    className="flex-1 rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm font-medium text-zinc-600 dark:text-slate-300 hover:bg-zinc-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    {t("schedule.conflictCancel")}
                  </button>
                  <button
                    type="button"
                    onClick={handleForceBook}
                    disabled={booking}
                    className="flex-1 rounded bg-amber-600 dark:bg-amber-700 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 dark:hover:bg-amber-600 disabled:opacity-50 transition-colors"
                  >
                    {t("schedule.conflictForce")}
                  </button>
                </div>
              </div>
            ) : scheduledSlot && !rescheduleMode ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 px-3 py-2.5">
                  <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-blue-700 dark:text-blue-300">
                      {t("schedule.booked")}
                    </p>
                    <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 truncate">
                      {formatSlotBadge(scheduledSlot)}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleReschedule}
                    disabled={clearing}
                    className="flex-1 rounded border border-blue-200 dark:border-blue-800 px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 disabled:opacity-50 transition-colors"
                  >
                    {t("schedule.reschedule")}
                  </button>
                  <button
                    type="button"
                    onClick={handleClear}
                    disabled={clearing}
                    className="flex-1 rounded border border-red-200 dark:border-red-800 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 transition-colors"
                  >
                    {t("schedule.remove")}
                  </button>
                </div>
              </div>
            ) : mode === "manual" ? (
              <div className="space-y-3">
                {duration > 0 && (
                  <p className="text-[11px] text-zinc-500 dark:text-slate-400">
                    {t("schedule.duration")}: {duration} min
                  </p>
                )}
                <div>
                  <label className="block text-[11px] font-medium text-zinc-600 dark:text-slate-300 mb-1">{t("schedule.date")}</label>
                  <input
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    min={dateMin ?? new Date().toISOString().split("T")[0]}
                    max={dateMax}
                    className="w-full rounded border border-zinc-300 dark:border-slate-600 px-2.5 py-1.5 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-zinc-600 dark:text-slate-300 mb-1">{t("schedule.time")}</label>
                  <input
                    type="time"
                    value={manualTime}
                    onChange={(e) => setManualTime(e.target.value)}
                    className="w-full rounded border border-zinc-300 dark:border-slate-600 px-2.5 py-1.5 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleManualBook}
                  disabled={booking || !manualDate || !manualTime}
                  className="w-full rounded bg-slate-700 dark:bg-slate-600 px-3 py-2 text-sm font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-50 transition-colors"
                >
                  {t("schedule.book")}
                </button>
              </div>
            ) : loading ? (
              <div className="space-y-2">
                {serverSuggestedSlot && (
                  <div className="mb-2">
                    <div className="flex items-center justify-between rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-medium text-amber-600 dark:text-amber-400 mb-0.5">
                          {t("schedule.suggestedByOwner")}
                        </p>
                        <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                          {new Date(serverSuggestedSlot.start).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}{", "}
                          {new Date(serverSuggestedSlot.start).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleBook({ start: serverSuggestedSlot.start, end: serverSuggestedSlot.end, label: "" })}
                        disabled={booking}
                        className="shrink-0 rounded bg-amber-600 dark:bg-amber-700 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 dark:hover:bg-amber-600 disabled:opacity-50 transition-colors"
                      >
                        {t("schedule.select")}
                      </button>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-center py-6">
                  <div className="flex items-center gap-2 text-zinc-400 dark:text-slate-500">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="text-xs">{t("schedule.loading")}</span>
                  </div>
                </div>
              </div>
            ) : slots.length === 0 && !serverSuggestedSlot ? (
              <div className="py-6 text-center">
                <p className="text-xs text-zinc-400 dark:text-slate-500 italic">
                  {t("schedule.noSlots")}
                </p>
                <button
                  type="button"
                  onClick={() => setMode("manual")}
                  className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {t("schedule.manual")}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {serverSuggestedSlot && (
                  <div className="mb-2">
                    <div className="flex items-center justify-between rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-medium text-amber-600 dark:text-amber-400 mb-0.5">
                          {t("schedule.suggestedByOwner")}
                        </p>
                        <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                          {new Date(serverSuggestedSlot.start).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}{", "}
                          {new Date(serverSuggestedSlot.start).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleBook({ start: serverSuggestedSlot.start, end: serverSuggestedSlot.end, label: "" })}
                        disabled={booking}
                        className="shrink-0 rounded bg-amber-600 dark:bg-amber-700 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 dark:hover:bg-amber-600 disabled:opacity-50 transition-colors"
                      >
                        {t("schedule.select")}
                      </button>
                    </div>
                  </div>
                )}
                {duration > 0 && (
                  <div className="mb-2">
                    <p className="text-[11px] text-zinc-600 dark:text-slate-300 font-medium">
                      {t("schedule.duration")}: {duration} min
                    </p>
                    <p className="text-[10px] text-zinc-400 dark:text-slate-500 italic">
                      {durationSource === "task"
                        ? t("schedule.sourceTask")
                        : `${t("schedule.sourceSettings")} (${effort})`}
                    </p>
                  </div>
                )}
                {slots.map((slot, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-md border border-zinc-200 dark:border-slate-600 px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <span className="text-sm text-zinc-800 dark:text-slate-200 font-medium">
                      {slot.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleBook(slot)}
                      disabled={booking}
                      className="shrink-0 rounded bg-slate-700 dark:bg-slate-600 px-3 py-1 text-xs font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-50 transition-colors"
                    >
                      {t("schedule.select")}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
    </>
  );

  const scheduleTriggerClass = scheduledSlot
    ? "w-6 h-6 rounded flex items-center justify-center border border-zinc-300 dark:border-slate-600 text-zinc-400 hover:border-blue-500 hover:text-blue-500 dark:hover:border-blue-400 dark:hover:text-blue-400 transition-colors"
    : "w-6 h-6 rounded flex items-center justify-center border border-blue-200/90 dark:border-blue-500/35 bg-blue-50/90 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:border-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 hover:text-blue-700 dark:hover:text-blue-300 dark:hover:border-blue-400 transition-colors ring-1 ring-inset ring-blue-200/50 dark:ring-blue-400/20";

  return (
    <>
      <div ref={ref} className="relative inline-flex">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleOpen(); }}
          title={t("schedule.title")}
          aria-expanded={open}
          className={scheduleTriggerClass}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </button>

        {open && presentation === "popover" && (
          <div
            ref={popoverRef}
            style={popoverStyle}
            className={panelShellClass}
            onClick={(e) => e.stopPropagation()}
          >
            {renderScheduleBody()}
          </div>
        )}
      </div>
      {mounted && open && presentation === "modal" && createPortal(
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="slot-picker-dialog-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
            aria-label={t("cancel")}
            onClick={() => setOpen(false)}
          />
          <div
            className={`relative z-[1] max-h-[90vh] overflow-y-auto ${panelShellClass}`}
            onClick={(e) => e.stopPropagation()}
          >
            {renderScheduleBody()}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

export function ScheduledSlotBadge({ slot }: { slot: ScheduledSlot }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 shrink-0 whitespace-nowrap">
      📅 {formatScheduledSlotLabel(slot)}
    </span>
  );
}