"use client";

import { useCallback, useEffect, useState } from "react";

import AppShell from "@/components/AppShell";
import { SoftLock, SoftLockHint } from "@/components/SoftLock";
import { useAuth } from "@/components/AuthContext";
import { useToast } from "@/components/Toast";
import { useLocale } from "@/lib/LocaleContext";
import { createOkr, deleteOkr, listOkrs, refreshOkr, type OkrObjective } from "@/lib/api/okr";

export default function OkrPage() {
  const { t } = useLocale();
  const { toast } = useToast();
  const { user } = useAuth();
  const canUse =
    !!user?.entitlements?.teamReporting ||
    !!user?.entitlements?.integrations ||
    !!user?.earlyBird;
  const [okrs, setOkrs] = useState<OkrObjective[]>([]);
  const [title, setTitle] = useState("");
  const [krTitle, setKrTitle] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!canUse) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setOkrs(await listOkrs());
    } catch {
      setOkrs([]);
    } finally {
      setLoading(false);
    }
  }, [canUse]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    if (!title.trim()) return;
    try {
      const okr = await createOkr({
        title: title.trim(),
        keyResults: krTitle.trim()
          ? [{ title: krTitle.trim(), target: 100, current: 0, unit: "%", linkedTodoIds: [], linkedProjectIds: [] }]
          : [],
      });
      setOkrs((prev) => [okr, ...prev]);
      setTitle("");
      setKrTitle("");
      toast.success(t("okr.created"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("okr.createError"));
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
                  okrs.map((o) => (
                    <li
                      key={o.id}
                      className="rounded-lg border border-zinc-200 dark:border-slate-700 p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h2 className="font-semibold">{o.title}</h2>
                          <p className="text-xs text-zinc-500 mt-1">
                            {t("okr.progress")}: {o.progressPercent ?? 0}%
                          </p>
                          {o.keyResults.map((kr) => (
                            <p key={kr.id} className="text-xs text-zinc-600 dark:text-slate-300 mt-1">
                              KR: {kr.title} — {kr.current}/{kr.target}
                              {kr.unit ?? ""}
                            </p>
                          ))}
                        </div>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className="text-xs px-2 py-1 border rounded"
                            onClick={() =>
                              void refreshOkr(o.id)
                                .then((updated) =>
                                  setOkrs((prev) => prev.map((x) => (x.id === o.id ? updated : x))),
                                )
                                .catch(() => toast.error(t("okr.refreshError")))
                            }
                          >
                            {t("okr.refresh")}
                          </button>
                          <button
                            type="button"
                            className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded"
                            onClick={() =>
                              void deleteOkr(o.id)
                                .then(() => setOkrs((prev) => prev.filter((x) => x.id !== o.id)))
                                .catch(() => toast.error(t("okr.deleteError")))
                            }
                          >
                            {t("okr.delete")}
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 h-2 rounded bg-zinc-100 dark:bg-slate-800">
                        <div
                          className="h-full rounded bg-emerald-500"
                          style={{ width: `${o.progressPercent ?? 0}%` }}
                        />
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </>
          )}
        </SoftLock>
      </div>
    </AppShell>
  );
}
