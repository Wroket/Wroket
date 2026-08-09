"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import AppShell from "@/components/AppShell";
import { SoftLock, SoftLockHint } from "@/components/SoftLock";
import { useAuth } from "@/components/AuthContext";
import { useToast } from "@/components/Toast";
import { useLocale } from "@/lib/LocaleContext";
import {
  createOkr,
  deleteOkr,
  listOkrs,
  refreshOkr,
  updateOkr,
  type OkrKeyResult,
  type OkrObjective,
} from "@/lib/api/okr";
import { getTodos, type Todo } from "@/lib/api/todos";

function defaultKr(title: string): OkrKeyResult {
  return {
    id: crypto.randomUUID(),
    title,
    target: 100,
    current: 0,
    unit: "%",
    linkedTodoIds: [],
    linkedProjectIds: [],
  };
}

function krHasLinks(kr: OkrKeyResult): boolean {
  return (kr.linkedTodoIds?.length ?? 0) > 0;
}

function objectiveHasAnyLinks(o: OkrObjective): boolean {
  return o.keyResults.some(krHasLinks);
}

function countUnresolvedLinks(o: OkrObjective, todoById: Map<string, Todo>): number {
  let n = 0;
  for (const kr of o.keyResults) {
    for (const id of kr.linkedTodoIds ?? []) {
      if (!todoById.has(id)) n += 1;
    }
  }
  return n;
}

export default function OkrPage() {
  const { t } = useLocale();
  const { toast } = useToast();
  const { user } = useAuth();
  const canUse =
    !!user?.entitlements?.teamReporting ||
    !!user?.entitlements?.integrations ||
    !!user?.earlyBird;
  const [okrs, setOkrs] = useState<OkrObjective[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [title, setTitle] = useState("");
  const [krTitle, setKrTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [taskQuery, setTaskQuery] = useState("");
  const [draftProgress, setDraftProgress] = useState<Record<string, number>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const todoById = useMemo(() => new Map(todos.map((td) => [td.id, td])), [todos]);

  const linkableTodos = useMemo(
    () => todos.filter((td) => !td.parentId && (td.status === "active" || td.status === "completed")),
    [todos],
  );

  const filteredTodos = useMemo(() => {
    const q = taskQuery.trim().toLowerCase();
    if (!q) return linkableTodos;
    return linkableTodos.filter((td) => (td.title || "").toLowerCase().includes(q));
  }, [linkableTodos, taskQuery]);

  const load = useCallback(async () => {
    if (!canUse) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [okrList, todoList] = await Promise.all([listOkrs(), getTodos().catch(() => [] as Todo[])]);
      setOkrs(okrList);
      setTodos(todoList);
    } catch {
      setOkrs([]);
    } finally {
      setLoading(false);
    }
  }, [canUse]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!expandedId) return;
    const o = okrs.find((x) => x.id === expandedId);
    if (!o) return;
    const next: Record<string, number> = {};
    for (const kr of o.keyResults) {
      if (!krHasLinks(kr)) {
        next[kr.id] = Math.min(100, Math.max(0, Math.round(kr.current)));
      }
    }
    setDraftProgress(next);
  }, [expandedId, okrs]);

  const replaceOkr = (updated: OkrObjective) => {
    setOkrs((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
  };

  const persistKeyResults = async (o: OkrObjective, keyResults: OkrKeyResult[], thenRefresh: boolean) => {
    setSavingId(o.id);
    try {
      let updated = await updateOkr(o.id, { keyResults });
      if (thenRefresh && keyResults.some(krHasLinks)) {
        updated = await refreshOkr(o.id);
        const unresolved = countUnresolvedLinks(updated, todoById);
        if (unresolved > 0) {
          toast.error(t("okr.unresolvedLinks").replace("{n}", String(unresolved)));
        }
      }
      replaceOkr(updated);
      return updated;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("okr.updateError"));
      throw e;
    } finally {
      setSavingId(null);
    }
  };

  const ensureObjectiveHasKr = async (o: OkrObjective): Promise<OkrObjective> => {
    if (o.keyResults.length > 0) return o;
    const keyResults = [defaultKr(t("okr.defaultKr"))];
    return persistKeyResults(o, keyResults, false);
  };

  const handleCreate = async () => {
    if (!title.trim()) return;
    try {
      const krLabel = krTitle.trim() || t("okr.defaultKr");
      const okr = await createOkr({
        title: title.trim(),
        keyResults: [
          {
            title: krLabel,
            target: 100,
            current: 0,
            unit: "%",
            linkedTodoIds: [],
            linkedProjectIds: [],
          },
        ],
      });
      setOkrs((prev) => [okr, ...prev]);
      setTitle("");
      setKrTitle("");
      setExpandedId(okr.id);
      toast.success(t("okr.created"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("okr.createError"));
    }
  };

  const handleToggleExpand = async (o: OkrObjective) => {
    if (expandedId === o.id) {
      setExpandedId(null);
      setTaskQuery("");
      return;
    }
    setTaskQuery("");
    setExpandedId(o.id);
    if (o.keyResults.length === 0) {
      try {
        await ensureObjectiveHasKr(o);
      } catch {
        /* toast already shown */
      }
    }
  };

  const handleToggleTodoLink = async (o: OkrObjective, kr: OkrKeyResult, todoId: string, checked: boolean) => {
    const linkedTodoIds = checked
      ? [...new Set([...(kr.linkedTodoIds ?? []), todoId])]
      : (kr.linkedTodoIds ?? []).filter((id) => id !== todoId);
    const keyResults = o.keyResults.map((row) =>
      row.id === kr.id ? { ...row, linkedTodoIds } : row,
    );
    await persistKeyResults(o, keyResults, linkedTodoIds.length > 0);
  };

  const handleSaveManualProgress = async (o: OkrObjective, kr: OkrKeyResult) => {
    const value = Math.min(100, Math.max(0, Math.round(draftProgress[kr.id] ?? kr.current ?? 0)));
    const keyResults = o.keyResults.map((row) =>
      row.id === kr.id
        ? { ...row, current: value, target: 100, unit: "%" }
        : row,
    );
    try {
      await persistKeyResults(o, keyResults, false);
      toast.success(t("okr.progressSaved"));
    } catch {
      /* toast already shown */
    }
  };

  const handleRefresh = async (o: OkrObjective) => {
    if (!objectiveHasAnyLinks(o)) {
      toast.error(t("okr.refreshNoLinks"));
      return;
    }
    setSavingId(o.id);
    try {
      const updated = await refreshOkr(o.id);
      replaceOkr(updated);
      const unresolved = countUnresolvedLinks(updated, todoById);
      if (unresolved > 0) {
        toast.error(t("okr.unresolvedLinks").replace("{n}", String(unresolved)));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("okr.refreshError"));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-1">{t("okr.title")}</h1>
        <p className="text-sm text-zinc-500 mb-6">{t("okr.subtitle")}</p>

        <SoftLock locked={!canUse} tier="large">
          {!canUse && <SoftLockHint tier="large" className="mb-4" />}
          {loading ? (
            <div className="py-12 flex justify-center">
              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-zinc-200 dark:border-slate-700 p-4 mb-6 space-y-2">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("okr.objectivePlaceholder")}
                  className="w-full rounded border border-zinc-200 dark:border-slate-600 bg-transparent px-3 py-2 text-sm"
                />
                <input
                  value={krTitle}
                  onChange={(e) => setKrTitle(e.target.value)}
                  placeholder={t("okr.krPlaceholder")}
                  className="w-full rounded border border-zinc-200 dark:border-slate-600 bg-transparent px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => void handleCreate()}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white"
                >
                  {t("okr.create")}
                </button>
              </div>

              <ul className="space-y-3">
                {okrs.length === 0 ? (
                  <p className="text-sm text-zinc-400">{t("okr.empty")}</p>
                ) : (
                  okrs.map((o) => {
                    const expanded = expandedId === o.id;
                    const busy = savingId === o.id;
                    return (
                      <li
                        key={o.id}
                        className="rounded-lg border border-zinc-200 dark:border-slate-700 p-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h2 className="font-semibold">{o.title}</h2>
                            <p className="text-xs text-zinc-500 mt-1">
                              {t("okr.progress")}: {o.progressPercent ?? 0}%
                            </p>
                            {o.keyResults.map((kr) => (
                              <p key={kr.id} className="text-xs text-zinc-600 dark:text-slate-300 mt-1">
                                {t("okr.krLabel")}: {kr.title} — {kr.current}/{kr.target}
                                {kr.unit ?? ""}
                                {krHasLinks(kr) ? ` · ${t("okr.fromTasks")}` : ""}
                              </p>
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-1 justify-end shrink-0">
                            <button
                              type="button"
                              className="text-xs px-2 py-1 border rounded border-zinc-200 dark:border-slate-600"
                              onClick={() => void handleToggleExpand(o)}
                            >
                              {expanded ? t("okr.collapse") : t("okr.manage")}
                            </button>
                            <button
                              type="button"
                              className="text-xs px-2 py-1 border rounded disabled:opacity-40"
                              disabled={busy || !objectiveHasAnyLinks(o)}
                              title={!objectiveHasAnyLinks(o) ? t("okr.refreshNoLinks") : undefined}
                              onClick={() => void handleRefresh(o)}
                            >
                              {t("okr.refresh")}
                            </button>
                            <button
                              type="button"
                              className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded"
                              disabled={busy}
                              onClick={() =>
                                void deleteOkr(o.id)
                                  .then(() => {
                                    setOkrs((prev) => prev.filter((x) => x.id !== o.id));
                                    if (expandedId === o.id) setExpandedId(null);
                                  })
                                  .catch(() => toast.error(t("okr.deleteError")))
                              }
                            >
                              {t("okr.delete")}
                            </button>
                          </div>
                        </div>
                        <div className="mt-3 h-2 rounded bg-zinc-100 dark:bg-slate-800">
                          <div
                            className="h-full rounded bg-emerald-500 transition-[width]"
                            style={{ width: `${o.progressPercent ?? 0}%` }}
                          />
                        </div>

                        {expanded && (
                          <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-slate-800 space-y-4">
                            <p className="text-xs text-zinc-500">{t("okr.linkTasksHint")}</p>
                            {o.keyResults.map((kr) => {
                              const linked = krHasLinks(kr);
                              return (
                                <div key={kr.id} className="space-y-2">
                                  <p className="text-xs font-medium text-zinc-700 dark:text-slate-200">
                                    {t("okr.krLabel")}: {kr.title}
                                  </p>

                                  {!linked && (
                                    <div className="rounded-md border border-zinc-200 dark:border-slate-700 p-3 space-y-2">
                                      <div className="flex items-center justify-between gap-2">
                                        <label className="text-xs text-zinc-500" htmlFor={`okr-prog-${kr.id}`}>
                                          {t("okr.manualProgress")}: {draftProgress[kr.id] ?? kr.current ?? 0}%
                                        </label>
                                        <button
                                          type="button"
                                          disabled={busy}
                                          onClick={() => void handleSaveManualProgress(o, kr)}
                                          className="text-xs px-2 py-1 rounded bg-emerald-600 text-white disabled:opacity-50"
                                        >
                                          {t("okr.saveProgress")}
                                        </button>
                                      </div>
                                      <input
                                        id={`okr-prog-${kr.id}`}
                                        type="range"
                                        min={0}
                                        max={100}
                                        step={1}
                                        value={draftProgress[kr.id] ?? kr.current ?? 0}
                                        disabled={busy}
                                        onChange={(e) =>
                                          setDraftProgress((prev) => ({
                                            ...prev,
                                            [kr.id]: Number(e.target.value),
                                          }))
                                        }
                                        className="w-full accent-emerald-600"
                                      />
                                    </div>
                                  )}

                                  <div className="rounded-md border border-zinc-200 dark:border-slate-700 p-3 space-y-2">
                                    <p className="text-xs font-medium text-zinc-500">{t("okr.linkTasks")}</p>
                                    <input
                                      type="search"
                                      value={taskQuery}
                                      onChange={(e) => setTaskQuery(e.target.value)}
                                      placeholder={t("okr.searchTasks")}
                                      className="w-full rounded border border-zinc-200 dark:border-slate-600 bg-transparent px-2 py-1.5 text-xs"
                                    />
                                    {(kr.linkedTodoIds ?? []).length > 0 && (
                                      <div className="flex flex-wrap gap-1">
                                        {(kr.linkedTodoIds ?? []).map((id) => {
                                          const td = todoById.get(id);
                                          return (
                                            <span
                                              key={id}
                                              className="inline-flex items-center gap-1 max-w-full rounded-full border border-zinc-200 dark:border-slate-600 px-2 py-0.5 text-[11px] text-zinc-600 dark:text-slate-300"
                                            >
                                              <span className="truncate">
                                                {td?.title || id.slice(0, 8)}
                                                {td?.status === "completed" ? " ✓" : ""}
                                              </span>
                                              <button
                                                type="button"
                                                disabled={busy}
                                                className="text-zinc-400 hover:text-red-500"
                                                aria-label={t("okr.unlinkTask")}
                                                onClick={() => void handleToggleTodoLink(o, kr, id, false)}
                                              >
                                                ×
                                              </button>
                                            </span>
                                          );
                                        })}
                                      </div>
                                    )}
                                    <div className="max-h-40 overflow-y-auto space-y-1">
                                      {filteredTodos.length === 0 ? (
                                        <p className="text-[11px] text-zinc-400">{t("okr.noTasks")}</p>
                                      ) : (
                                        filteredTodos.map((td) => {
                                          const selected = (kr.linkedTodoIds ?? []).includes(td.id);
                                          return (
                                            <label
                                              key={td.id}
                                              className={`flex items-center gap-2 text-xs text-zinc-700 dark:text-slate-300 ${
                                                busy ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                                              }`}
                                            >
                                              <input
                                                type="checkbox"
                                                checked={selected}
                                                disabled={busy}
                                                onChange={(e) =>
                                                  void handleToggleTodoLink(o, kr, td.id, e.target.checked)
                                                }
                                                className="rounded border-zinc-300 dark:border-slate-600"
                                              />
                                              <span className="truncate">
                                                {td.title || t("todos.untitled")}
                                                {td.status === "completed" ? " ✓" : ""}
                                              </span>
                                            </label>
                                          );
                                        })
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </li>
                    );
                  })
                )}
              </ul>
            </>
          )}
        </SoftLock>
      </div>
    </AppShell>
  );
}
