"use client";

import { useCallback, useEffect, useState } from "react";

import { SoftLock, SoftLockHint } from "@/components/SoftLock";
import { useAuth } from "@/components/AuthContext";
import { useLocale } from "@/lib/LocaleContext";
import { API_BASE_URL, apiFetchDefaults } from "@/lib/api/core";

interface TimesheetRow {
  todoId: string;
  todoTitle: string;
  userId: string;
  minutes: number;
  sessionCount: number;
}

interface TimesheetReport {
  from: string;
  to: string;
  totalMinutes: number;
  rows: TimesheetRow[];
}

interface Props {
  projectId: string;
}

function weekRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - 7);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default function ProjectTimesheetPanel({ projectId }: Props) {
  const { t } = useLocale();
  const { user } = useAuth();
  const canUse = !!user?.entitlements?.integrations || !!user?.earlyBird;
  const [report, setReport] = useState<TimesheetReport | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!canUse) return;
    setLoading(true);
    try {
      const { from, to } = weekRange();
      const qs = new URLSearchParams({ from, to });
      const res = await fetch(
        `${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/timesheet?${qs}`,
        { ...apiFetchDefaults, method: "GET" },
      );
      if (!res.ok) throw new Error("timesheet");
      setReport((await res.json()) as TimesheetReport);
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [canUse, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportCsv = () => {
    const { from, to } = weekRange();
    const qs = new URLSearchParams({ from, to, format: "csv" });
    window.open(
      `${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/timesheet?${qs}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const fmt = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ""}` : `${m}m`;
  };

  return (
    <div className="rounded-md border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-slate-400">
          {t("timesheet.title")}
        </h3>
        {canUse && report && (
          <button
            type="button"
            onClick={exportCsv}
            className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400"
          >
            {t("timesheet.exportCsv")}
          </button>
        )}
      </div>
      <SoftLock locked={!canUse} tier="small">
        {!canUse && <SoftLockHint tier="small" className="mb-2" />}
        {loading ? (
          <div className="py-4 flex justify-center">
            <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !report || report.rows.length === 0 ? (
          <p className="text-xs text-zinc-400">{t("timesheet.empty")}</p>
        ) : (
          <>
            <p className="text-xs text-zinc-500 mb-2">
              {t("timesheet.total")}: <strong>{fmt(report.totalMinutes)}</strong>
            </p>
            <ul className="space-y-1 max-h-40 overflow-y-auto">
              {report.rows.slice(0, 20).map((r) => (
                <li key={`${r.todoId}:${r.userId}`} className="flex justify-between gap-2 text-xs">
                  <span className="truncate">{r.todoTitle}</span>
                  <span className="shrink-0 font-medium">{fmt(r.minutes)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </SoftLock>
    </div>
  );
}
