"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import ViewportOverlay, { sheetPanelClass } from "@/components/ui/ViewportOverlay";
import { useNarrowVisualViewport } from "@/hooks/useVisualViewportRect";
import { useLocale } from "@/lib/LocaleContext";
import { useToast } from "@/components/Toast";
import { formatUserFacingError } from "@/lib/apiErrors";
import {
  applyAssistCommitteeShare,
  applyAssistPlanWeekBooks,
  getProjects,
  previewAssistCommittee,
  previewAssistPlanWeek,
  previewAssistRisks,
  type AssistCommitteePreview,
  type AssistPlanWeekPreview,
  type AssistRisksPreview,
  type Project,
} from "@/lib/api";

type PreviewKind = "committee" | "plan-week" | "risks";

type PreviewState =
  | { kind: "committee"; data: AssistCommitteePreview }
  | { kind: "plan-week"; data: AssistPlanWeekPreview }
  | { kind: "risks"; data: AssistRisksPreview };

export interface AssistPmoPanelProps {
  /** When set, committee CTA uses this project (project page). */
  projectId?: string | null;
  className?: string;
  /** Compact single-button mode for project steering. */
  committeeOnly?: boolean;
}

/**
 * IA Phase 2 — deterministic PMO assist (preview → confirm). No hosted LLM.
 */
export default function AssistPmoPanel({
  projectId: fixedProjectId = null,
  className = "",
  committeeOnly = false,
}: AssistPmoPanelProps) {
  const { t } = useLocale();
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(fixedProjectId ?? "");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const narrow = useNarrowVisualViewport(!!preview);

  useEffect(() => {
    if (fixedProjectId) {
      setSelectedProjectId(fixedProjectId);
      return;
    }
    let cancelled = false;
    getProjects()
      .then((list) => {
        if (cancelled) return;
        const active = list.filter((p) => p.status === "active");
        setProjects(active);
        if (!selectedProjectId && active[0]) setSelectedProjectId(active[0].id);
      })
      .catch(() => {
        /* non-blocking */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once for dashboard picker
  }, [fixedProjectId]);

  useEffect(() => {
    if (fixedProjectId) setSelectedProjectId(fixedProjectId);
  }, [fixedProjectId]);

  const runPreview = useCallback(
    async (kind: PreviewKind) => {
      setLoading(true);
      try {
        if (kind === "committee") {
          const pid = selectedProjectId.trim();
          if (!pid) {
            toast.error(t("assist.needProject"));
            return;
          }
          const data = await previewAssistCommittee(pid);
          setPreview({ kind, data });
          return;
        }
        if (kind === "plan-week") {
          const data = await previewAssistPlanWeek();
          setPreview({ kind, data });
          return;
        }
        const data = await previewAssistRisks();
        setPreview({ kind, data });
      } catch (err) {
        toast.error(formatUserFacingError(err, "toast.genericError"));
      } finally {
        setLoading(false);
      }
    },
    [selectedProjectId, t, toast],
  );

  const closePreview = () => setPreview(null);

  const applyPreview = async (force = false) => {
    if (!preview) return;
    setApplying(true);
    try {
      if (preview.kind === "committee") {
        if (!preview.data.canCreateShareLink) {
          toast.error(t("assist.shareForbidden"));
          return;
        }
        const result = await applyAssistCommitteeShare(preview.data.projectId);
        toast.success(t("assist.shareCreated"));
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(result.publicUrl).catch(() => undefined);
        }
        closePreview();
        return;
      }
      if (preview.kind === "plan-week") {
        const bookings = preview.data.suggestions.map((s) => ({
          todoId: s.todoId,
          start: s.proposedStart,
          end: s.proposedEnd,
        }));
        if (bookings.length === 0) {
          toast.error(t("assist.noBookings"));
          return;
        }
        const result = await applyAssistPlanWeekBooks(bookings, force);
        if (result.conflicts.length > 0 && result.booked.length === 0 && !force) {
          toast.error(t("assist.bookConflicts"));
          // Keep dialog open — user can force
          setPreview({
            kind: "plan-week",
            data: {
              ...preview.data,
              summaryMarkdown:
                preview.data.summaryMarkdown +
                "\n\n_" +
                t("assist.bookConflictsHint") +
                "_",
            },
          });
          return;
        }
        if (result.booked.length > 0) {
          toast.success(
            t("assist.bookedCount").replace("{{n}}", String(result.booked.length)),
          );
        }
        if (result.errors.length > 0) {
          toast.error(result.errors[0]?.message ?? t("toast.genericError"));
        }
        closePreview();
        return;
      }
      closePreview();
    } catch (err) {
      toast.error(formatUserFacingError(err, "toast.genericError"));
    } finally {
      setApplying(false);
    }
  };

  const btnCls =
    "rounded border border-zinc-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-medium text-zinc-800 dark:text-slate-100 hover:bg-zinc-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-60";

  const panelCls = sheetPanelClass(
    narrow,
    "relative bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-lg w-full mx-4 p-6 outline-none max-h-[min(85dvh,36rem)] overflow-y-auto",
  );

  const showApply =
    preview?.kind === "committee"
      ? preview.data.canCreateShareLink
      : preview?.kind === "plan-week"
        ? preview.data.suggestions.length > 0
        : false;

  return (
    <div
      className={`bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-4 ${className}`}
      data-testid="assist-pmo-panel"
    >
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-slate-100">
        {t("assist.title")}
      </h3>
      <p className="mt-1 text-xs text-zinc-500 dark:text-slate-400">{t("assist.subtitle")}</p>

      {!committeeOnly && !fixedProjectId && (
        <label className="mt-3 block">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-slate-400">
            {t("assist.projectLabel")}
          </span>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="mt-0.5 w-full rounded border border-zinc-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-zinc-800 dark:text-slate-100"
          >
            <option value="">{t("assist.projectPlaceholder")}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className={`mt-3 flex flex-wrap gap-2 ${committeeOnly ? "" : ""}`}>
        <button
          type="button"
          className={btnCls}
          disabled={loading}
          onClick={() => void runPreview("committee")}
        >
          {t("assist.committee")}
        </button>
        {!committeeOnly && (
          <>
            <button
              type="button"
              className={btnCls}
              disabled={loading}
              onClick={() => void runPreview("plan-week")}
            >
              {t("assist.planWeek")}
            </button>
            <button
              type="button"
              className={btnCls}
              disabled={loading}
              onClick={() => void runPreview("risks")}
            >
              {t("assist.risks")}
            </button>
          </>
        )}
      </div>

      {preview && (
        <ViewportOverlay open onClose={closePreview} zClassName="z-[9998]">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="assist-preview-title"
            className={panelCls}
            data-testid="assist-preview-dialog"
          >
            <h2
              id="assist-preview-title"
              className="text-lg font-semibold text-zinc-900 dark:text-slate-100"
            >
              {preview.kind === "committee"
                ? t("assist.committee")
                : preview.kind === "plan-week"
                  ? t("assist.planWeek")
                  : t("assist.risks")}
            </h2>
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{t("assist.suggestionDisclaimer")}</p>
            <pre className="mt-3 whitespace-pre-wrap text-sm text-zinc-700 dark:text-slate-300 font-sans">
              {preview.data.summaryMarkdown.replace(/\*/g, "")}
            </pre>
            {preview.kind === "committee" && preview.data.activeShareLinks[0] && (
              <p className="mt-2 text-xs">
                <Link
                  href={preview.data.activeShareLinks[0].publicUrl}
                  className="text-emerald-700 dark:text-emerald-400 hover:underline"
                  target="_blank"
                >
                  {preview.data.activeShareLinks[0].publicUrl}
                </Link>
              </p>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closePreview}
                className="px-4 py-2 text-sm rounded-md border border-zinc-300 dark:border-slate-600 text-zinc-700 dark:text-slate-300"
              >
                {t("cancel")}
              </button>
              {preview.kind === "plan-week" && preview.data.suggestions.length > 0 && (
                <button
                  type="button"
                  disabled={applying}
                  onClick={() => void applyPreview(true)}
                  className="px-4 py-2 text-sm rounded-md border border-amber-500 text-amber-900 dark:text-amber-200"
                >
                  {t("assist.applyForce")}
                </button>
              )}
              {showApply && (
                <button
                  type="button"
                  disabled={applying}
                  onClick={() => void applyPreview(false)}
                  className="px-4 py-2 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {preview.kind === "committee"
                    ? t("assist.applyShare")
                    : t("assist.applyBooks")}
                </button>
              )}
            </div>
          </div>
        </ViewportOverlay>
      )}
    </div>
  );
}
