"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { useLocale } from "@/lib/LocaleContext";
import { getSharedProjectView, type ShareLinkTab, type SharedProjectView } from "@/lib/api/projectShare";
import { getHealthConfig } from "@/app/projects/_components/types";
import { WroketLockup } from "@/components/brand/WroketBrand";
import GanttChart from "@/app/projects/_components/GanttChart";
import SharedKanbanView from "../_components/SharedKanbanView";
import {
  sharedMilestonesToProjectMilestones,
  sharedPhasesToProjectPhases,
  sharedTasksToTodos,
} from "../_components/sharedViewMappers";

type ShareTab = ShareLinkTab;

const TAB_LABEL: Record<ShareTab, "share.publicPilotage" | "projects.kanban" | "gantt.view"> = {
  pilotage: "share.publicPilotage",
  kanban: "projects.kanban",
  gantt: "gantt.view",
};

export default function SharedProjectPage() {
  const { t, locale } = useLocale();
  const routeParams = useParams();
  const tokenParam = routeParams?.token;
  const token =
    typeof tokenParam === "string"
      ? decodeURIComponent(tokenParam)
      : Array.isArray(tokenParam)
        ? decodeURIComponent(tokenParam[0] ?? "")
        : "";

  const [view, setView] = useState<SharedProjectView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ShareTab>("pilotage");

  useEffect(() => {
    if (!token) {
      setError(t("share.publicInvalid"));
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    getSharedProjectView(token)
      .then((v) => {
        if (!cancelled) {
          setView(v);
          const firstTab = v.allowedTabs[0] ?? "pilotage";
          setTab(firstTab);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t("share.publicInvalid"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, t]);

  const healthConfig = useMemo(() => getHealthConfig(t), [t]);
  const hc = view ? healthConfig[view.steering.health] : null;

  const phases = useMemo(
    () => (view ? sharedPhasesToProjectPhases(view) : []),
    [view],
  );
  const ganttTasks = useMemo(
    () => (view ? sharedTasksToTodos(view.tasks) : []),
    [view],
  );
  const milestones = useMemo(
    () => (view ? sharedMilestonesToProjectMilestones(view) : []),
    [view],
  );

  const allowedTabs = view?.allowedTabs ?? [];
  const showTabBar = allowedTabs.length > 1;
  const wideTab = tab === "kanban" || tab === "gantt";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-slate-950 text-zinc-900 dark:text-slate-100">
      <header className="border-b border-zinc-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 shrink-0 min-w-0">
            <WroketLockup theme="auto" />
          </Link>
          <span className="text-xs text-zinc-500">{t("share.publicBadge")}</span>
        </div>
      </header>

      <main className={`mx-auto px-4 py-8 ${wideTab ? "max-w-6xl" : "max-w-4xl"}`}>
        {loading && <p className="text-sm text-zinc-500">{t("share.publicLoading")}</p>}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 px-4 py-6 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
        {view && hc && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold">{view.projectName}</h1>
              {view.projectDescription && (
                <p className="text-sm text-zinc-600 dark:text-slate-400 mt-2">{view.projectDescription}</p>
              )}
            </div>

            {showTabBar && (
              <div className="flex flex-wrap gap-1 rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1">
                {allowedTabs.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      tab === key
                        ? "bg-slate-700 dark:bg-slate-600 text-white"
                        : "text-zinc-600 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    {t(TAB_LABEL[key])}
                  </button>
                ))}
              </div>
            )}

            {tab === "pilotage" && allowedTabs.includes("pilotage") && (
              <>
                <div className="rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${hc.bg} ${hc.color}`}>
                      <span className={`w-2 h-2 rounded-full ${hc.ring}`} />
                      {hc.label}
                    </span>
                    {view.steering.completionRatio !== null && (
                      <span className="text-sm text-zinc-600 dark:text-slate-400">
                        {view.steering.completionRatio}% {t("projects.steeringCompleted")}
                      </span>
                    )}
                    <span className="text-sm text-zinc-500">
                      {view.steering.overdueCount} {t("share.publicOverdue")}
                    </span>
                  </div>
                </div>

                {view.steering.phases.length > 0 && (
                  <section>
                    <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                      {t("projects.steeringPhases")}
                    </h2>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {view.steering.phases.map((ph) => {
                        const phc = healthConfig[ph.health];
                        return (
                          <div
                            key={ph.phaseId}
                            className="rounded border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                          >
                            <div className="font-medium">{ph.phaseName || t("share.publicUnphased")}</div>
                            <div className={`text-xs mt-1 ${phc.color}`}>{phc.label}</div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                <section>
                  <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                    {t("share.publicTasks")}
                  </h2>
                  <ul className="divide-y divide-zinc-100 dark:divide-slate-800 rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                    {view.tasks.map((task) => (
                      <li key={task.id} className="px-3 py-2 text-sm flex items-center gap-2">
                        {task.isBlocked && <span className="text-amber-500" title={t("dependencies.blockedBadge")}>⛔</span>}
                        <span className={task.status === "completed" ? "line-through opacity-60 flex-1" : "flex-1"}>
                          {task.title}
                        </span>
                        {task.phaseName && (
                          <span className="text-[10px] text-zinc-400 shrink-0">{task.phaseName}</span>
                        )}
                        {task.deadline && (
                          <span className="text-[10px] text-zinc-400 shrink-0">{task.deadline}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            )}

            {tab === "kanban" && allowedTabs.includes("kanban") && (
              <section>
                <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                  {t("projects.kanban")}
                </h2>
                <SharedKanbanView phases={phases} tasks={view.tasks} t={t} />
              </section>
            )}

            {tab === "gantt" && allowedTabs.includes("gantt") && (
              <section>
                <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                  {t("gantt.title")}
                </h2>
                <div className="rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
                  <GanttChart
                    phases={phases}
                    tasks={ganttTasks}
                    milestones={milestones}
                    t={t}
                    locale={locale}
                    variant="readonly"
                  />
                </div>
              </section>
            )}

            {view.expiresAt && (
              <p className="text-xs text-zinc-400 text-center">
                {t("share.publicExpires")} {new Date(view.expiresAt).toLocaleString()}
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
