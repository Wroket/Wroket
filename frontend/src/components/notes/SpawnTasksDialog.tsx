"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";

import ViewportOverlay, { sheetPanelClass } from "@/components/ui/ViewportOverlay";
import { useNarrowVisualViewport } from "@/hooks/useVisualViewportRect";
import { useLocale } from "@/lib/LocaleContext";
import { formatUserFacingError } from "@/lib/apiErrors";
import { getTaskSuggestConfig, spawnTasksFromNote, suggestTasksFromNote, type SpawnTasksResult, type TaskSuggestConfig } from "@/lib/api/notes";
import type { Priority } from "@/lib/api/todos";
import type { Project } from "@/lib/api/projects";
import { htmlToPlainLines, type ProposedTaskLine } from "@/lib/noteTaskLines";

interface SpawnTasksDialogProps {
  open: boolean;
  noteId: string;
  lines: ProposedTaskLine[];
  /** Note HTML the suggestion reads. The local line split is used until the user asks. */
  sourceHtml?: string;
  projects: Project[];
  defaultProjectId?: string | null;
  /** When set, created tasks become subtasks of this meeting task. */
  parentId?: string | null;
  onClose: () => void;
  onCreated?: () => void;
}

/**
 * Confirm action lines before they become tasks. Nothing is written until Create.
 */
export default function SpawnTasksDialog({
  open,
  noteId,
  lines,
  sourceHtml = "",
  projects,
  defaultProjectId,
  parentId,
  onClose,
  onCreated,
}: SpawnTasksDialogProps) {
  const { t } = useLocale();
  const titleId = useId();
  const narrow = useNarrowVisualViewport(open);
  const [items, setItems] = useState<ProposedTaskLine[]>(lines);
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [phaseId, setPhaseId] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestConfig, setSuggestConfig] = useState<TaskSuggestConfig | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SpawnTasksResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setItems(lines);
    setProjectId(defaultProjectId ?? "");
    setPhaseId("");
    setDraft("");
    setError(null);
    setNotice(null);
    setResult(null);
    setBusy(false);
    setSuggesting(false);
    getTaskSuggestConfig().then(setSuggestConfig).catch(() => setSuggestConfig({ enabled: false, dailyLimit: 0, remaining: 0 }));
    // Capture the note text only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const suggest = async () => {
    const text = htmlToPlainLines(sourceHtml).join("\n").trim();
    if (!text) return;
    setSuggesting(true);
    setError(null);
    setNotice(null);
    try {
      const tasks = await suggestTasksFromNote(noteId, text);
      if (tasks.length === 0) {
        setNotice(t("notes.spawn.suggestEmpty"));
        return;
      }
      setItems(tasks.map((task, index) => ({
        clientKey: `s${index}`,
        title: task.title,
        deadline: task.deadline,
        priority: task.priority,
        included: true,
      })));
      const config = await getTaskSuggestConfig().catch(() => null);
      if (config) setSuggestConfig(config);
    } catch (err) {
      setError(formatUserFacingError(err, "errors.fallback.generic"));
    } finally {
      setSuggesting(false);
    }
  };

  const project = projects.find((item) => item.id === projectId);
  const phases = project?.phases ?? [];

  const update = (clientKey: string, patch: Partial<ProposedTaskLine>) => {
    setItems((current) => current.map((item) => (item.clientKey === clientKey ? { ...item, ...patch } : item)));
  };

  const addLine = () => {
    const title = draft.trim();
    if (!title || items.length >= 25) return;
    setItems((current) => [
      ...current,
      { clientKey: `m${Date.now()}`, title, deadline: "", priority: "medium", included: true },
    ]);
    setDraft("");
  };

  const submit = async () => {
    const chosen = items.filter((item) => item.included && item.title.trim());
    if (chosen.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const created = await spawnTasksFromNote(noteId, {
        projectId: parentId ? null : projectId || null,
        phaseId: parentId ? null : phaseId || null,
        parentId: parentId || null,
        items: chosen.map((item) => ({
          clientKey: item.clientKey,
          title: item.title.trim(),
          deadline: item.deadline || null,
          priority: item.priority,
        })),
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
    <ViewportOverlay open={open} onClose={busy || suggesting ? undefined : onClose} zClassName="z-[110]" backdropClassName="absolute inset-0 bg-black/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={sheetPanelClass(narrow, "relative w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-700 shadow-xl p-5 space-y-4")}
      >
        <h2 id={titleId} className="text-base font-semibold text-zinc-900 dark:text-slate-100">{t("notes.spawn.title")}</h2>

        {result ? (
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
            {suggestConfig?.enabled && (
              <div className="space-y-2 rounded-md border border-zinc-200 dark:border-slate-700 p-3">
                <p className="text-xs text-zinc-500 dark:text-slate-400">{t("notes.spawn.suggestHint")}</p>
                {typeof suggestConfig.remaining === "number" && (
                  <p className="text-xs text-zinc-500 dark:text-slate-400">{t("notes.spawn.suggestRemaining").replace("{n}", String(suggestConfig.remaining))}</p>
                )}
                <button
                  type="button"
                  disabled={suggesting || busy || htmlToPlainLines(sourceHtml).join("").trim().length < 2}
                  onClick={() => { void suggest(); }}
                  className="rounded-lg border border-zinc-300 dark:border-slate-600 px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  {suggesting ? t("notes.spawn.suggesting") : t("notes.spawn.suggest")}
                </button>
              </div>
            )}
            {notice && <p className="text-sm text-amber-700 dark:text-amber-300">{notice}</p>}
            {items.length === 0 && <p className="text-sm text-zinc-600 dark:text-slate-300">{t("notes.spawn.empty")}</p>}
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {items.map((item) => (
                <li key={item.clientKey} className="flex flex-wrap items-center gap-2">
                  <input
                    type="checkbox"
                    checked={item.included}
                    onChange={(e) => update(item.clientKey, { included: e.target.checked })}
                    aria-label={item.title}
                  />
                  <input
                    value={item.title}
                    onChange={(e) => update(item.clientKey, { title: e.target.value })}
                    className="flex-1 min-w-[8rem] rounded-md border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
                  />
                  <input
                    type="date"
                    value={item.deadline}
                    onChange={(e) => update(item.clientKey, { deadline: e.target.value })}
                    aria-label={t("notes.spawn.deadline")}
                    className="rounded-md border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs"
                  />
                  <select
                    value={item.priority}
                    aria-label={t("notes.spawn.priority")}
                    onChange={(e) => update(item.clientKey, { priority: e.target.value as Priority })}
                    className="rounded-md border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs"
                  >
                    <option value="low">{t("priority.low")}</option>
                    <option value="medium">{t("priority.medium")}</option>
                    <option value="high">{t("priority.high")}</option>
                  </select>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t("notes.spawn.placeholder")}
                className="flex-1 rounded-md border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
              />
              <button type="button" onClick={addLine} disabled={!draft.trim() || items.length >= 25} className="text-sm font-medium text-emerald-700 dark:text-emerald-300 disabled:opacity-40">
                {t("notes.spawn.addLine")}
              </button>
            </div>
            {!parentId && (
              <div className="flex flex-wrap gap-2">
                <label className="text-xs text-zinc-500 dark:text-slate-400 flex flex-col gap-1">
                  {t("notes.spawn.project")}
                  <select
                    value={projectId}
                    onChange={(e) => { setProjectId(e.target.value); setPhaseId(""); }}
                    className="rounded-md border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm text-zinc-800 dark:text-slate-100"
                  >
                    <option value="">{t("notes.spawn.noProject")}</option>
                    {projects.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </label>
                {phases.length > 0 && (
                  <label className="text-xs text-zinc-500 dark:text-slate-400 flex flex-col gap-1">
                    {t("notes.spawn.phase")}
                    <select
                      value={phaseId}
                      onChange={(e) => setPhaseId(e.target.value)}
                      className="rounded-md border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm text-zinc-800 dark:text-slate-100"
                    >
                      <option value="">{t("notes.spawn.noPhase")}</option>
                      {phases.map((phase) => (
                        <option key={phase.id} value={phase.id}>{phase.name}</option>
                      ))}
                    </select>
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
                disabled={busy || suggesting || !items.some((item) => item.included && item.title.trim())}
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
