"use client";

import { forwardRef, useMemo, useRef, useState, useEffect } from "react";

import { computeProjectSteering, steeringSnapshotToCsv } from "@/lib/projectSteering";
import { getHealthConfig } from "@/app/projects/_components/types";
import type { Project, Todo } from "@/lib/api";
import type { TranslationKey } from "@/lib/i18n";

interface Props {
  project: Project;
  todos: Todo[];
  t: (key: TranslationKey) => string;
  locale: string;
  onExportPdf?: () => void | Promise<void>;
  exportingPdf?: boolean;
}

const ProjectSteeringPanel = forwardRef<HTMLDivElement, Props>(function ProjectSteeringPanel(
  { project, todos, t, locale, onExportPdf, exportingPdf = false },
  ref,
) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const snap = useMemo(
    () => computeProjectSteering(project, todos),
    [project, todos],
  );
  const healthConfig = useMemo(() => getHealthConfig(t), [t]);
  const hc = healthConfig[snap.health];

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  function handleExportSteeringCsv() {
    setMenuOpen(false);
    const csv = steeringSnapshotToCsv(project.name, snap);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const slug = project.name.replace(/[^a-z0-9]+/gi, "-").substring(0, 40);
    a.href = url;
    a.download = `wroket-steering-${slug}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleExportSteeringPdf() {
    if (!onExportPdf || exportingPdf) return;
    setMenuOpen(false);
    await onExportPdf();
  }

  return (
    <div
      ref={ref}
      className="rounded-md border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-xs font-semibold text-zinc-500 dark:text-slate-400 uppercase tracking-wider">
            {t("projects.steeringTitle")}
          </h4>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${hc.bg} ${hc.color}`}>
              <span className={`w-2 h-2 rounded-full ${hc.ring}`} />
              {hc.label}
            </span>
            {snap.completionRatio !== null && (
              <span className="text-xs text-zinc-500 dark:text-slate-400">
                {snap.completionRatio}% {t("projects.steeringCompleted")}
              </span>
            )}
          </div>
        </div>
        <div className="relative" ref={menuRef} data-export-hide>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            disabled={exportingPdf}
            className="inline-flex items-center gap-1 rounded bg-slate-700 dark:bg-slate-600 hover:bg-slate-800 dark:hover:bg-slate-500 text-white text-[11px] font-medium px-2.5 py-1 transition-colors leading-none disabled:opacity-60"
          >
            {exportingPdf ? t("projects.steeringExportPdfGenerating") : t("projects.steeringExport")}
            <svg className="w-3 h-3 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-30 min-w-[10rem] rounded-md border border-zinc-200 dark:border-slate-600 bg-white dark:bg-slate-900 py-1 shadow-lg">
              <button
                type="button"
                onClick={handleExportSteeringCsv}
                className="block w-full text-left px-3 py-1.5 text-xs text-zinc-700 dark:text-slate-200 hover:bg-zinc-100 dark:hover:bg-slate-800"
              >
                {t("projects.steeringExportCsv")}
              </button>
              {onExportPdf && (
                <button
                  type="button"
                  onClick={() => void handleExportSteeringPdf()}
                  disabled={exportingPdf}
                  className="block w-full text-left px-3 py-1.5 text-xs text-zinc-700 dark:text-slate-200 hover:bg-zinc-100 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  {t("projects.steeringExportPdf")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Kpi label={t("projects.steeringActive")} value={snap.activeCount} />
        <Kpi label={t("projects.steeringOverdue")} value={snap.overdueCount} accent={snap.overdueCount > 0 ? "text-red-600 dark:text-red-400" : undefined} />
        <Kpi label={t("projects.steeringAtRisk")} value={snap.atRiskCount} accent={snap.atRiskCount > 0 ? "text-amber-600 dark:text-amber-400" : undefined} />
        <Kpi label={t("projects.steeringNoDeadline")} value={snap.noDeadlineCount} />
      </div>

      {snap.upcomingMilestones.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-zinc-500 dark:text-slate-400 uppercase tracking-wide mb-2">
            {t("projects.steeringMilestones")}
          </p>
          <ul className="space-y-1">
            {snap.upcomingMilestones.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-zinc-700 dark:text-slate-300 truncate">
                  {m.source === "milestone" && (
                    <span className="mr-1 text-amber-600 dark:text-amber-400" aria-hidden>◆</span>
                  )}
                  {m.label}
                </span>
                <span className={`shrink-0 tabular-nums ${m.daysLeft < 0 ? "text-red-600 dark:text-red-400 font-medium" : "text-zinc-500 dark:text-slate-400"}`}>
                  {m.daysLeft < 0
                    ? t("projects.steeringMilestoneOverdue").replace("{days}", String(Math.abs(m.daysLeft)))
                    : m.daysLeft === 0
                      ? t("projects.steeringMilestoneToday")
                      : new Date(m.endDate + "T12:00:00").toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", { day: "numeric", month: "short" })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {snap.phases.some((p) => p.overdueCount > 0) && (
        <div>
          <p className="text-[11px] font-semibold text-zinc-500 dark:text-slate-400 uppercase tracking-wide mb-2">
            {t("projects.steeringPhaseRollup")}
          </p>
          <ul className="space-y-1">
            {snap.phases
              .filter((p) => p.overdueCount > 0)
              .map((p) => (
                <li key={p.phaseId} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-zinc-700 dark:text-slate-300 truncate">{p.phaseName || t("projects.unassignedPhase")}</span>
                  <span className="shrink-0 text-red-600 dark:text-red-400 font-medium">
                    {p.overdueCount} {t("projects.steeringOverdueShort")}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
});

export default ProjectSteeringPanel;

function Kpi({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-md border border-zinc-100 dark:border-slate-800 px-3 py-2 text-center">
      <p className={`text-lg font-bold tabular-nums ${accent ?? "text-zinc-900 dark:text-slate-100"}`}>{value}</p>
      <p className="text-[10px] text-zinc-500 dark:text-slate-400 mt-0.5">{label}</p>
    </div>
  );
}
