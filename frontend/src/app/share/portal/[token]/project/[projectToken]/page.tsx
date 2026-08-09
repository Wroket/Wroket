"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { useLocale } from "@/lib/LocaleContext";
import { getClientPortalProject, type PortalProjectView } from "@/lib/api/clientPortal";
import type { ShareLinkTab } from "@/lib/api/projectShare";
import { getHealthConfig } from "@/app/projects/_components/types";
import { WroketLockup } from "@/components/brand/WroketBrand";
import GanttChart from "@/app/projects/_components/GanttChart";
import SharedKanbanView from "../../../project/_components/SharedKanbanView";
import {
  sharedMilestonesToProjectMilestones,
  sharedPhasesToProjectPhases,
  sharedTasksToTodos,
} from "../../../project/_components/sharedViewMappers";

const TAB_LABEL: Record<ShareLinkTab, "share.publicPilotage" | "projects.kanban" | "gantt.view"> = {
  pilotage: "share.publicPilotage",
  kanban: "projects.kanban",
  gantt: "gantt.view",
};

export default function PortalProjectPage() {
  const { t, locale } = useLocale();
  const params = useParams();
  const portalToken =
    typeof params?.token === "string" ? decodeURIComponent(params.token) : "";
  const projectToken =
    typeof params?.projectToken === "string" ? decodeURIComponent(params.projectToken) : "";

  const [view, setView] = useState<PortalProjectView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ShareLinkTab>("pilotage");

  useEffect(() => {
    if (!portalToken || !projectToken) {
      setError(t("share.publicInvalid"));
      setLoading(false);
      return;
    }
    let cancelled = false;
    getClientPortalProject(portalToken, projectToken)
      .then((v) => {
        if (!cancelled) {
          setView(v);
          setTab(v.allowedTabs[0] ?? "pilotage");
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
  }, [portalToken, projectToken, t]);

  const healthConfig = useMemo(() => getHealthConfig(t), [t]);
  const hc = view ? healthConfig[view.steering.health] : null;
  const phases = useMemo(() => (view ? sharedPhasesToProjectPhases(view) : []), [view]);
  const ganttTasks = useMemo(() => (view ? sharedTasksToTodos(view.tasks) : []), [view]);
  const milestones = useMemo(
    () => (view ? sharedMilestonesToProjectMilestones(view) : []),
    [view],
  );

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-slate-950">
      <header className="border-b border-zinc-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={`/share/portal/${encodeURIComponent(portalToken)}`}
              className="text-xs text-emerald-600 dark:text-emerald-400 shrink-0"
            >
              ← {t("portal.backToHub")}
            </Link>
            {view?.branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={view.branding.logoUrl} alt="" className="h-7 max-w-[120px] object-contain" />
            ) : (
              <WroketLockup />
            )}
          </div>
          <span className="text-[10px] font-semibold uppercase text-zinc-400">{t("portal.publicBadge")}</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {loading && <p className="text-sm text-zinc-500 text-center py-12">{t("share.publicLoading")}</p>}
        {error && <p className="text-sm text-red-600 text-center py-12">{error}</p>}
        {view && !loading && !error && (
          <>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-slate-100">{view.projectName}</h1>
            {hc && (
              <p className={`text-xs font-semibold mt-1 ${hc.text}`}>{hc.label}</p>
            )}
            <div className="flex gap-1 mt-4 mb-4 border-b border-zinc-200 dark:border-slate-700">
              {view.allowedTabs.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px ${
                    tab === key
                      ? "border-emerald-500 text-emerald-700 dark:text-emerald-400"
                      : "border-transparent text-zinc-500"
                  }`}
                >
                  {t(TAB_LABEL[key])}
                </button>
              ))}
            </div>
            {tab === "pilotage" && (
              <div className="space-y-3">
                {view.privacy.showTasks === false ? (
                  <p className="text-sm text-zinc-500">{t("portal.tasksHidden")}</p>
                ) : (
                  <ul className="space-y-1">
                    {view.tasks.map((task) => (
                      <li
                        key={task.id}
                        className="text-sm px-3 py-2 rounded border border-zinc-100 dark:border-slate-800 bg-white dark:bg-slate-900"
                      >
                        {task.title}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {tab === "kanban" && view.privacy.showTasks !== false && (
              <SharedKanbanView phases={phases} tasks={view.tasks} t={t} />
            )}
            {tab === "gantt" && view.privacy.showTasks !== false && (
              <GanttChart
                variant="readonly"
                phases={phases}
                tasks={ganttTasks}
                milestones={milestones}
                t={t}
                locale={locale}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
