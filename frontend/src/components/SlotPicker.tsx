"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  getTaskSlots,
  bookTaskSlot,
  clearTaskSlot,
  type ScheduledSlot,
  type SlotProposal,
  type Todo,
} from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import { useToast } from "@/components/Toast";

export interface SlotPickerProps {
  todoId: string;
  scheduledSlot: ScheduledSlot | null;
  onBooked: (todo: Todo) => void;
  onCleared: (todo: Todo) => void;
  autoOpen?: boolean;
}

export default function SlotPicker({ todoId, scheduledSlot, onBooked, onCleared, autoOpen }: SlotPickerProps) {
  const { t } = useLocale();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const autoOpenedRef = useRef(false);

  useEffect(() => {
    if (autoOpen && !autoOpenedRef.current && !scheduledSlot) {
      autoOpenedRef.current = true;
      setOpen(true);
      fetchSlots();
    }
  }, [autoOpen, scheduledSlot]); // eslint-disable-line react-hooks/exhaustive-deps
  const [loading, setLoading] = useState(false);
  const [slots, setSlots] = useState<SlotProposal[]>([]);
  const [duration, setDuration] = useState(0);
  const [durationSource, setDurationSource] = useState<"task" | "settings">("settings");
  const [effort, setEffort] = useState("");
  const [booking, setBooking] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [mode, setMode] = useState<"suggested" | "manual">("suggested");
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
    } catch {
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [todoId]);

  const handleOpen = () => {
    computePosition();
    setOpen(true);
    if (!scheduledSlot) fetchSlots();
  };

  const handleBook = async (slot: SlotProposal) => {
    setBooking(true);
    try {
      const updated = await bookTaskSlot(todoId, slot.start, slot.end);
      onBooked(updated);
      setOpen(false);
    } catch {
      toast.error(t("toast.updateError"));
    } finally {
      setBooking(false);
    }
  };

  const handleManualBook = async () => {
    if (!manualDate || !manualTime) return;
    const start = new Date(`${manualDate}T${manualTime}`);
    const end = new Date(start.getTime() + (duration || 30) * 60 * 1000);
    setBooking(true);
    try {
      const updated = await bookTaskSlot(todoId, start.toISOString(), end.toISOString());
      onBooked(updated);
      setOpen(false);
    } catch {
      /* silent */
    } finally {
      setBooking(false);
    }
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
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("mousedown", handleClick); document.removeEventListener("keydown", handleKey); };
  }, [open]);

  const formatSlotBadge = (slot: ScheduledSlot): string => {
    const d = new Date(slot.start);
    const day = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
    const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    return `📅 ${day}, ${time}`;
  };

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); handleOpen(); }}
        title={t("schedule.title")}
        aria-expanded={open}
        className="w-6 h-6 rounded flex items-center justify-center border border-zinc-300 dark:border-slate-600 text-zinc-400 hover:border-blue-500 hover:text-blue-500 dark:hover:border-blue-400 dark:hover:text-blue-400 transition-colors"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </button>

      {open && (
        <div
          ref={popoverRef}
          style={popoverStyle}
          className="bg-white dark:bg-slate-800 border border-zinc-200 dark:border-slate-600 rounded-lg shadow-xl w-72"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 py-3 border-b border-zinc-100 dark:border-slate-700">
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-slate-100 mb-2">
              {t("schedule.title")}
            </h4>
            {!scheduledSlot && (
              <div className="flex gap-1">
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
            {scheduledSlot ? (
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
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={clearing}
                  className="w-full rounded border border-red-200 dark:border-red-800 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 transition-colors"
                >
                  {t("schedule.remove")}
                </button>
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
                    min={new Date().toISOString().split("T")[0]}
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
              <div className="flex items-center justify-center py-6">
                <div className="flex items-center gap-2 text-zinc-400 dark:text-slate-500">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-xs">{t("schedule.loading")}</span>
                </div>
              </div>
            ) : slots.length === 0 ? (
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
        </div>
      )}
    </div>
  );
}

export function ScheduledSlotBadge({ slot }: { slot: ScheduledSlot }) {
  const d = new Date(slot.start);
  const day = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 shrink-0 whitespace-nowrap">
      📅 {day}, {time}
    </span>
  );
}
