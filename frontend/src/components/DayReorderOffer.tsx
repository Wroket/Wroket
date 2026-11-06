"use client";

import { useEffect, useId, useState } from "react";

import ViewportOverlay, { sheetPanelClass } from "@/components/ui/ViewportOverlay";
import { useNarrowVisualViewport } from "@/hooks/useVisualViewportRect";
import {
  applyDayReorder,
  dayReorderIgnored,
  getDayReorder,
  ignoreDayReorder,
  type DayReorderPlan,
} from "@/lib/api/calendar";
import { formatUserFacingError } from "@/lib/apiErrors";
import { useLocale } from "@/lib/LocaleContext";
import { broadcastTodosMutated } from "@/lib/todoSyncBroadcast";

function clock(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString(locale === "fr" ? "fr-FR" : "en-GB", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Shows a same-day reorder when an external appointment overlaps a booked slot.
 * Ignore and Apply are the only outcomes. Opening the dialog writes nothing.
 */
export default function DayReorderOffer() {
  const { t, locale } = useLocale();
  const titleId = useId();
  const [plan, setPlan] = useState<DayReorderPlan | null>(null);
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ title: string; message: string }[]>([]);
  const narrow = useNarrowVisualViewport(!!plan);

  useEffect(() => {
    let cancelled = false;
    getDayReorder().then((next) => {
      if (cancelled || !next || next.moves.length === 0 || dayReorderIgnored(next.signature)) return;
      setPlan(next);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!plan) return null;
  const canApply = plan.moves.some((move) => move.to);

  const ignore = () => {
    ignoreDayReorder(plan.signature);
    setPlan(null);
  };

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await applyDayReorder(plan.signature);
      if (result.stale) {
        setStale(true);
        setPlan(result.plan.moves.length > 0 ? result.plan : null);
        return;
      }
      if (result.applied.length > 0) broadcastTodosMutated();
      setFailed(result.failed.map((item) => ({ title: item.title, message: item.message })));
      setDone(true);
    } catch (err) {
      setError(formatUserFacingError(err, "errors.fallback.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ViewportOverlay open zClassName="z-[120]" closeOnBackdrop={false} backdropClassName="absolute inset-0 bg-black/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={sheetPanelClass(narrow, "relative w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-700 shadow-xl p-5 space-y-4")}
      >
        <h2 id={titleId} className="text-base font-semibold text-zinc-900 dark:text-slate-100">{t("schedule.dayReorder.title")}</h2>
        {done ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-700 dark:text-slate-200">{t("schedule.dayReorder.done")}</p>
            {failed.length > 0 && (
              <div className="text-xs text-red-600 dark:text-red-400 space-y-1">
                <p>{t("schedule.dayReorder.failed")}</p>
                {failed.map((item) => <p key={item.title}>{item.title} — {item.message}</p>)}
              </div>
            )}
            <div className="flex justify-end">
              <button type="button" onClick={() => setPlan(null)} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-3 py-1.5">
                {t("schedule.dayReorder.close")}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs text-zinc-500 dark:text-slate-400">{t("schedule.dayReorder.hint")}</p>
            {stale && <p className="text-sm text-amber-700 dark:text-amber-300">{t("schedule.dayReorder.stale")}</p>}
            {plan.triggers.length > 0 && (
              <p className="text-sm text-zinc-700 dark:text-slate-200">
                {t("schedule.dayReorder.because")}{" "}
                {plan.triggers.map((item) => `${item.title} (${clock(item.start, locale)}–${clock(item.end, locale)})`).join(", ")}
              </p>
            )}
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {plan.moves.map((move) => (
                <li key={move.todoId} className="text-sm text-zinc-800 dark:text-slate-100">
                  <span className="font-medium">{move.title}</span>
                  <span className="block text-xs text-zinc-500 dark:text-slate-400">
                    {clock(move.from.start, locale)}–{clock(move.from.end, locale)}
                    {" → "}
                    {move.to ? `${clock(move.to.start, locale)}–${clock(move.to.end, locale)}` : t("schedule.dayReorder.unplaced")}
                  </span>
                </li>
              ))}
            </ul>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={ignore} disabled={busy} className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 dark:text-slate-300 disabled:opacity-40">
                {t("schedule.dayReorder.ignore")}
              </button>
              <button
                type="button"
                onClick={() => { void apply(); }}
                disabled={busy || !canApply}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-3 py-1.5 disabled:opacity-40"
              >
                {busy ? t("schedule.dayReorder.applying") : t("schedule.dayReorder.apply")}
              </button>
            </div>
          </>
        )}
      </div>
    </ViewportOverlay>
  );
}
