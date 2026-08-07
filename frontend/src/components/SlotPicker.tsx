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
  type TodayAvailability,
} from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import { useToast } from "@/components/Toast";
import { formatScheduledSlotLabel } from "@/lib/slotFormat";
import { TAG_AUX } from "@/lib/tagPalette";
import { toolbarAffordanceClass } from "@/components/taskToolbarStyles";

export interface SlotPickerProps {
  todoId: string;
  scheduledSlot: ScheduledSlot | null;
  suggestedSlot?: SuggestedSlot | null;
  onBooked: (todo: Todo) => void;
  onCleared: (todo: Todo) => void;
  autoOpen?: boolean;
  /** Increment to open the picker (e.g. from an overflow menu). */
  openSignal?: number;
  dateMin?: string;
  dateMax?: string;
}

export default function SlotPicker({ todoId, scheduledSlot, suggestedSlot, onBooked, onCleared, autoOpen, openSignal = 0, dateMin, dateMax }: SlotPickerProps) {
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
  const [slotsVisibleCount, setSlotsVisibleCount] = useState(3);
  const [todayAvailability, setTodayAvailability] = useState<TodayAvailability | null>(null);
  const [effectiveStartDate, setEffectiveStartDate] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
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
  const [manualWarn, setManualWarn] = useState<"heavy_late" | "outside_hours" | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  const computePosition = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const popW = 288;
    const margin = 8;
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const openBelow = spaceBelow >= 260 || spaceBelow >= spaceAbove;
    const available = openBelow ? spaceBelow : spaceAbove;
    const maxH = Math.max(220, Math.min(available, window.innerHeight - margin * 2));
    const openRight = window.innerWidth - rect.left >= popW;
    const left = openRight
      ? Math.min(rect.left, window.innerWidth - popW - margin)
      : undefined;
    const right = openRight ? undefined : Math.max(margin, window.innerWidth - rect.right);

    setPopoverStyle({
      position: "fixed",
      top: openBelow ? rect.bottom + 4 : undefined,
      bottom: openBelow ? undefined : window.innerHeight - rect.top + 4,
      left,
      right,
      zIndex: 9999,
      maxHeight: maxH,
      overflowY: "auto",
    });
  }, []);

  useEffect(() => {
    if (!open || presentation !== "popover") return;
    computePosition();
    const onResize = () => computePosition();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, presentation, slotsVisibleCount, slots.length, mode, computePosition]);

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    setSlotsVisibleCount(3);
    try {
      const data = await getTaskSlots(todoId);
      setSlots(data.slots);
      setTodayAvailability(data.todayAvailability ?? null);
      setEffectiveStartDate(data.effectiveStartDate ?? null);
      setDuration(data.duration);
      setEffort(data.effort);
      if (data.suggestedSlot) setServerSuggestedSlot(data.suggestedSlot);
    } catch {
      setSlots([]);
      setTodayAvailability(null);
      setEffectiveStartDate(null);
    } finally {
      setLoading(false);
    }
  }, [todoId]);

  const handleOpen = () => {
    setPresentation("modal");
    setOpen(true);
    setRescheduleMode(false);
    if (!scheduledSlot) fetchSlots();
  };

  const lastOpenSignalRef = useRef(0);
  useEffect(() => {
    if (!openSignal || openSignal === lastOpenSignalRef.current) return;
    lastOpenSignalRef.current = openSignal;
    handleOpen();
  }, [openSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReschedule = async () => {
    setOpen(false);
    setClearing(true);
    try {
      const updated = await clearTaskSlot(todoId);
      onCleared(updated);
      setRescheduleMode(true);
      setMode("suggested");
      await fetchSlots();
      setPresentation("modal");
      setOpen(true);
    } catch {
      setPresentation("modal");
      setOpen(true);
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
    } catch (e) {
      setPresentation("modal");
      setOpen(true);
      const msg = e instanceof Error && e.message ? e.message : t("toast.updateError");
      toast.error(msg);
    } finally {
      setBooking(false);
    }
  };

  const handleBook = (slot: SlotProposal) => doBook(slot.start, slot.end);

  /** Soft checks for recoverable manual-slot constraints (heavy late / unusual hours). */
  const manualSlotWarning = (date: string, time: string): "heavy_late" | "outside_hours" | null => {
    const [hh, mm] = time.split(":").map(Number);
    const minutes = (hh ?? 0) * 60 + (mm ?? 0);
    if (minutes < 8 * 60 || minutes >= 18 * 60) return "outside_hours";
    if (effort === "heavy" && minutes >= 15 * 60) return "heavy_late";
    return null;
  };

  const handleManualBook = () => {
    if (!manualDate || !manualTime) return;
    if (!manualWarn) {
      const warn = manualSlotWarning(manualDate, manualTime);
      if (warn) {
        setManualWarn(warn);
        return;
      }
    }
    setManualWarn(null);
    const start = new Date(`${manualDate}T${manualTime}`);
    const end = new Date(start.getTime() + (duration || 30) * 60 * 1000);
    doBook(start.toISOString(), end.toISOString());
  };

  const todayHint = (() => {
    if (!todayAvailability || todayAvailability === "available") return null;
    if (todayAvailability === "before_start_date") {
      const raw = effectiveStartDate ?? "";
      const formatted = raw
        ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : raw).toLocaleDateString(undefined, {
            weekday: "short",
            day: "numeric",
            month: "short",
          })
        : "—";
      return t("schedule.today.before_start_date").replace("{date}", formatted);
    }
    return t(`schedule.today.${todayAvailability}`);
  })();

  const handleForceBook = () => {
    if (!pendingSlot) return;
    doBook(pendingSlot.start, pendingSlot.end, true);
  };

  const handleDismissConflict = () => {
    setConflicts([]);
    setPendingSlot(null);
  };

  const handleClear = async () => {
    setOpen(false);
    setClearing(true);
    try {
      const updated = await clearTaskSlot(todoId);
      onCleared(updated);
    } catch {
      setPresentation("modal");
      setOpen(true);
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
    "bg-white dark:bg-slate-800 border border-zinc-200 dark:border-slate-600 rounded-sm shadow-xl w-72 max-w-[min(100vw-2rem,18rem)] overflow-y-auto";

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
                    onChange={(e) => { setManualDate(e.target.value); setManualWarn(null); }}
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
                    onChange={(e) => { setManualTime(e.target.value); setManualWarn(null); }}
                    className="w-full rounded border border-zinc-300 dark:border-slate-600 px-2.5 py-1.5 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                {manualWarn && (
                  <div
                    role="dialog"
                    aria-modal="true"
                    className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5 space-y-2"
                  >
                    <p className="text-xs text-amber-900 dark:text-amber-100">
                      {manualWarn === "heavy_late" ? t("schedule.warnHeavyLate") : t("schedule.warnOutsideHours")}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setManualWarn(null)}
                        className="flex-1 rounded border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-xs font-medium text-zinc-700 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-700"
                      >
                        {t("cancel")}
                      </button>
                      <button
                        type="button"
                        onClick={handleManualBook}
                        disabled={booking}
                        className="flex-1 rounded bg-amber-600 dark:bg-amber-700 px-2 py-1.5 text-xs font-medium text-white hover:bg-amber-700 dark:hover:bg-amber-600 disabled:opacity-50"
                      >
                        {t("schedule.warnContinue")}
                      </button>
                    </div>
                  </div>
                )}
                {!manualWarn && (
                  <button
                    type="button"
                    onClick={handleManualBook}
                    disabled={booking || !manualDate || !manualTime}
                    className="w-full rounded bg-slate-700 dark:bg-slate-600 px-3 py-2 text-sm font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-50 transition-colors"
                  >
                    {t("schedule.book")}
                  </button>
                )}
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
                  <p className="mb-2 text-[11px] text-zinc-600 dark:text-slate-300 font-medium">
                    {t("schedule.duration")}: {duration} min
                  </p>
                )}
                {todayHint && (
                  <p className="text-[10px] text-amber-700 dark:text-amber-300 mb-1">
                    {todayHint}
                  </p>
                )}
                {slots.slice(0, slotsVisibleCount).map((slot, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 dark:border-slate-600 px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <span className="text-sm text-zinc-800 dark:text-slate-200 font-medium min-w-0 flex-1">
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
                {slots.length > slotsVisibleCount && (
                  <button
                    type="button"
                    onClick={() => {
                      setSlotsVisibleCount(slots.length);
                      requestAnimationFrame(() => {
                        popoverRef.current?.scrollTo({
                          top: popoverRef.current.scrollHeight,
                          behavior: "smooth",
                        });
                      });
                    }}
                    className="w-full rounded border border-zinc-200 dark:border-slate-600 px-3 py-2 text-xs font-medium text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    {t("schedule.moreSuggestions")}
                  </button>
                )}
              </div>
            )}
          </div>
    </>
  );

  const scheduleTriggerClass = toolbarAffordanceClass(!!scheduledSlot);

  const slotMutationBusy = booking || clearing;

  return (
    <>
      <div ref={ref} className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); if (!slotMutationBusy) handleOpen(); }}
          title={t("schedule.title")}
          aria-expanded={open}
          aria-busy={slotMutationBusy}
          disabled={slotMutationBusy}
          className={`${scheduleTriggerClass} ${slotMutationBusy ? "opacity-90 cursor-wait" : ""}`}
        >
          {slotMutationBusy ? (
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3V4a10 10 0 100 20 10 10 0 000-20v4z" />
            </svg>
          ) : (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          )}
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
            ref={popoverRef}
            className={`relative z-[1] w-full max-w-sm max-h-[min(90vh,36rem)] overflow-y-auto ${panelShellClass}`}
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
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 ${TAG_AUX.slot} shrink-0 whitespace-nowrap`}>
      📅 {formatScheduledSlotLabel(slot)}
    </span>
  );
}