"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import ExportImportDropdown from "@/components/ExportImportDropdown";
import { useToast } from "@/components/Toast";
import { exportProjectData, getProjects, getTeams, updateProject, type Project, type Team } from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";

export default function ArchivedProjectsPanel() {
  const { t } = useLocale();
  const { toast } = useToast();

  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, te] = await Promise.all([getProjects(), getTeams()]);
        if (!cancelled) {
          setProjects(p);
          setTeams(te);
        }
      } catch {
        if (!cancelled) toast.error(t("toast.loadError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast, t]);

  const teamById = useMemo(() => new Map(teams.map((tm) => [tm.id, tm])), [teams]);

  const archivedRootProjects = useMemo(
    () => projects.filter((p) => p.status === "archived" && !p.parentProjectId),
    [projects],
  );

  const teamLabel = (teamId: string | null) => {
    if (!teamId) return t("projects.personal");
    return teamById.get(teamId)?.name ?? "—";
  };

  const restoreProject = async (project: Project) => {
    try {
      const updated = await updateProject(project.id, { status: "active" });
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      toast.success(t("toast.projectRestored"));
    } catch {
      toast.error(t("toast.restoreError"));
    }
  };

  const exportArchivedProjects = useCallback(
    async (format: "csv" | "json") => {
      if (archivedRootProjects.length === 0) {
        toast.error(t("archives.exportProjectsEmpty"));
        return;
      }
      try {
        for (const p of archivedRootProjects) {
          await exportProjectData(p.id, format);
          await new Promise((r) => setTimeout(r, 400));
        }
      } catch {
        toast.error(t("export.error"));
      }
    },
    [archivedRootProjects, t, toast],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-slate-100">{t("archives.projects")}</h1>
          <p className="text-sm text-zinc-500 dark:text-slate-400 mt-1">{t("archives.projectsIntro")}</p>
        </div>
        <div className="shrink-0 flex justify-end">
          <ExportImportDropdown
            exportCsv={() => exportArchivedProjects("csv")}
            exportJson={() => exportArchivedProjects("json")}
            templateCsv="title,priority,effort,estimatedMinutes,startDate,deadline,tags,phaseName,assignedTo\nMy task,medium,medium,,,,,Phase 1,"
            templateJson={JSON.stringify([{ title: "My task", priority: "medium", effort: "medium", phaseName: "Phase 1" }], null, 2)}
          />
        </div>
      </div>

      {archivedRootProjects.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-8 text-center">
          <p className="text-sm text-zinc-400 dark:text-slate-500 italic">{t("archives.projectsEmpty")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {archivedRootProjects.map((project) => (
            <div
              key={project.id}
              className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-4 opacity-90 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-2">
                <Link
                  href={`/projects?project=${encodeURIComponent(project.id)}`}
                  className="font-semibold text-zinc-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 flex-1 min-w-0"
                >
                  {project.name}
                </Link>
                <button
                  type="button"
                  onClick={() => restoreProject(project)}
                  className="text-zinc-400 hover:text-blue-500 transition-colors shrink-0"
                  title={t("projects.restore")}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
              <p className="text-[10px] text-zinc-400 mt-1">{teamLabel(project.teamId)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
