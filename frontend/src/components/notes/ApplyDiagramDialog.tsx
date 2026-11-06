"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";

import ViewportOverlay, { sheetPanelClass } from "@/components/ui/ViewportOverlay";
import { HourglassStatus } from "@/components/notes/HourglassStatus";
import { useNarrowVisualViewport } from "@/hooks/useVisualViewportRect";
import { useLocale } from "@/lib/LocaleContext";
import { formatUserFacingError } from "@/lib/apiErrors";
import { listSpawnedTasks, spawnTasksFromNote, type NoteDiagramEdge, type SpawnTasksResult } from "@/lib/api/notes";
import type { Project } from "@/lib/api/projects";
import { rowsForApply, type ApplyDiagramNode, type ApplyDiagramRow } from "@/lib/diagramApply";

interface ApplyDiagramDialogProps {
  open: boolean;
  noteId: string;
  nodes: ApplyDiagramNode[];
  edges: NoteDiagramEdge[];
  projects: Project[];
  defaultProjectId?: string | null;
  /** Meeting task: created tasks become its subtasks. */
  parentId?: string | null;
  onClose: () => void;
  onCreated?: () => void;
}

/**
 * Confirm which boxes of a saved diagram become tasks.
 * Arrows become dependencies only after this confirmation.
 */
export default function ApplyDiagramDialog({
  open,
  noteId,
  nodes,
  edges,
  projects,
  defaultProjectId,
  parentId,
  onClose,
  onCreated,
}: ApplyDiagramDialogProps) {
  const { t } = useLocale();
  const titleId = useId();
  const narrow = useNarrowVisualViewport(open);
  const [rows, setRows] = useState<ApplyDiagramRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [phaseId, setPhaseId] = useState("");
  const [createPhases, setCreatePhases] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SpawnTasksResult | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setProjectId(defaultProjectId ?? "");
    setPhaseId("");
    setCreatePhases(false);
    setError(null);
    setResult(null);
    setBusy(false);
    setLoading(true);
    listSpawnedTasks(noteId)
      .then((tasks) => {
        if (cancelled) return;
        const existing = new Set(tasks.map((task) => task.originNodeId).filter((id): id is string => !!id));
        setRows(rowsForApply(nodes, existing));
      })
      .catch(() => {
        if (cancelled) return;
        setRows(rowsForApply(nodes, new Set()));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
    // Snapshot the boxes when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const project = projects.find((item) => item.id === projectId);
  const columns = [...new Set(rows.map((row) => row.column).filter(Boolean))];

  const submit = async () => {
    const chosen = rows.filter((row) => row.included && row.label.trim());
    if (chosen.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const chosenIds = new Set(chosen.map((row) => row.id));
      const created = await spawnTasksFromNote(noteId, {
        projectId: parentId ? null : projectId || null,
        phaseId: parentId ? null : phaseId || null,
        parentId: parentId || null,
        createPhases: createPhases && !parentId,
        items: chosen.map((row) => ({
          clientKey: row.id,
          title: row.label.trim(),
          column: row.column || null,
          priority: "medium",
        })),
        edges: edges.filter((edge) => chosenIds.has(edge.from) && chosenIds.has(edge.to)),
      });
      setResult(created);
      onCreated?.();
    } catch (err) {
      setError(formatUserFacingError(err, "errors.fallback.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ViewportOverlay open={open} onClose={busy ? undefined : onClose} zClassName="z-[110]" backdropClassName="absolute inset-0 bg-black/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={sheetPanelClass(narrow, "relative w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-700 shadow-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto")}
      >
        <h2 id={titleId} className="text-base font-semibold text-zinc-900 dark:text-slate-100">{t("notes.diagram.applyTitle")}</h2>
        {loading ? (
          <HourglassStatus label={t("notes.diagram.reading")} />
        ) : result ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-700 dark:text-slate-200">{t("notes.spawn.done")}</p>
            {result.dependenciesApplied && (
              <p className="text-xs text-emerald-700 dark:text-emerald-300">{t("notes.spawn.depsApplied")}</p>
            )}
            {result.dependencySkipped && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {t("notes.spawn.depsSkipped").replace("{code}", result.dependencySkipped)}
              </p>
            )}
            <ul className="space-y-1.5">
              {result.created.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-zinc-800 dark:text-slate-100">
                    {item.title}
                    {item.alreadyExisted ? ` · ${t("notes.spawn.existed")}` : ""}
                  </span>
                  <Link href={`/agenda?schedule=${encodeURIComponent(item.id)}`} className="shrink-0 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:underline">
                    {t("notes.spawn.plan")}
                  </Link>
                </li>
              ))}
            </ul>
            {result.failed.length > 0 && (
              <div className="text-xs text-red-600 dark:text-red-400 space-y-1">
                <p>{t("notes.spawn.failed")}</p>
                {result.failed.map((item) => (
                  <p key={item.clientKey}>{item.message}</p>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Link href="/todos" className="text-sm text-zinc-600 dark:text-slate-300 hover:underline px-2 py-1.5">{t("notes.spawn.openTasks")}</Link>
              <button type="button" onClick={onClose} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-3 py-1.5">
                {t("notes.spawn.close")}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs text-zinc-500 dark:text-slate-400">{t("notes.diagram.applyHint")}</p>
            {rows.length === 0 && <p className="text-sm text-zinc-600 dark:text-slate-300">{t("notes.diagram.emptyGraph")}</p>}
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {rows.map((row) => (
                <li key={row.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={row.included}
                    onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, included: event.target.checked } : item))}
                    aria-label={row.label}
                  />
                  <input
                    value={row.label}
                    readOnly={row.existed}
                    onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, label: event.target.value } : item))}
                    className="flex-1 min-w-0 rounded-md border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm read-only:bg-zinc-50 dark:read-only:bg-slate-800"
                  />
                  {row.existed && <span className="shrink-0 text-[11px] text-zinc-500 dark:text-slate-400">{t("notes.spawn.existed")}</span>}
                </li>
              ))}
            </ul>
            {!parentId && (
              <div className="flex flex-wrap gap-3 items-end">
                <label className="text-xs text-zinc-500 dark:text-slate-400 flex flex-col gap-1">
                  {t("notes.spawn.project")}
                  <select
                    value={projectId}
                    onChange={(event) => { setProjectId(event.target.value); setPhaseId(""); }}
                    className="rounded-md border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm text-zinc-800 dark:text-slate-100"
                  >
                    <option value="">{t("notes.spawn.noProject")}</option>
                    {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
                {(project?.phases.length ?? 0) > 0 && (
                  <label className="text-xs text-zinc-500 dark:text-slate-400 flex flex-col gap-1">
                    {t("notes.spawn.phase")}
                    <select
                      value={phaseId}
                      onChange={(event) => setPhaseId(event.target.value)}
                      className="rounded-md border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm text-zinc-800 dark:text-slate-100"
                    >
                      <option value="">{t("notes.spawn.noPhase")}</option>
                      {project?.phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.name}</option>)}
                    </select>
                  </label>
                )}
                {columns.length > 0 && projectId && (
                  <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-slate-200">
                    <input type="checkbox" checked={createPhases} onChange={(event) => setCreatePhases(event.target.checked)} />
                    {t("notes.diagram.createPhases")}
                  </label>
                )}
              </div>
            )}
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 dark:text-slate-300 hover:bg-zinc-100 dark:hover:bg-slate-800">
                {t("notes.spawn.cancel")}
              </button>
              <button
                type="button"
                disabled={busy || !rows.some((row) => row.included && row.label.trim())}
                onClick={() => { void submit(); }}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-medium px-3 py-1.5"
              >
                {busy ? t("notes.spawn.creating") : t("notes.spawn.create")}
              </button>
            </div>
          </>
        )}
      </div>
    </ViewportOverlay>
  );
}
