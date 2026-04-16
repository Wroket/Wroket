"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import ConfirmDialog from "@/components/ConfirmDialog";
import ExportImportDropdown from "@/components/ExportImportDropdown";
import { useToast } from "@/components/Toast";
import {
  deleteProjectApi,
  exportProjectData,
  getProjects,
  getTeams,
  updateProject,
  type Project,
  type Team,
} from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";

type ProjectArchiveConfirm =
  | { kind: "restore"; project: Project }
  | { kind: "delete"; project: Project }
  | { kind: "purge-all"; ids: string[] }
  | null;

const archiveActionBtnBase =
  "inline-flex items-center justify-center rounded border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap";

export default function ArchivedProjectsPanel() {
  const { t } = useLocale();
  const { toast } = useToast();

  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectConfirm, setProjectConfirm] = useState<ProjectArchiveConfirm>(null);

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

  const runRestoreProject = async (project: Project) => {
    try {
      const updated = await updateProject(project.id, { status: "active" });
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      toast.success(t("toast.projectRestored"));
    } catch {
      toast.error(t("toast.restoreError"));
    }
  };

  const runDeleteArchivedProject = async (project: Project) => {
    try {
      await deleteProjectApi(project.id);
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
      toast.success(t("archives.projectsRemoved").replace("{count}", "1"));
    } catch {
      toast.error(t("toast.deleteError"));
    }
  };

  const runDeleteAllArchivedProjects = async (ids: string[]) => {
    try {
      for (const id of ids) {
        await deleteProjectApi(id);
      }
      setProjects((prev) => prev.filter((p) => !ids.includes(p.id)));
      toast.success(t("archives.projectsRemoved").replace("{count}", String(ids.length)));
    } catch {
      toast.error(t("toast.deleteError"));
    }
  };

  const handleProjectConfirm = () => {
    const c = projectConfirm;
    setProjectConfirm(null);
    if (!c) return;
    void (async () => {
      if (c.kind === "restore") await runRestoreProject(c.project);
      else if (c.kind === "delete") await runDeleteArchivedProject(c.project);
      else if (c.kind === "purge-all") await runDeleteAllArchivedProjects(c.ids);
    })();
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
        <div className="shrink-0 flex flex-wrap justify-end gap-2">
          {archivedRootProjects.length > 0 && (
            <button
              type="button"
              onClick={() =>
                setProjectConfirm({
                  kind: "purge-all",
                  ids: archivedRootProjects.map((p) => p.id),
                })
              }
              className="rounded border border-red-200 dark:border-red-900/50 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
            >
              {t("archives.emptyProjects")}
            </button>
          )}
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
              </div>
              <p className="text-[10px] text-zinc-400 mt-1">{teamLabel(project.teamId)}</p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                <button
                  type="button"
                  onClick={() => setProjectConfirm({ kind: "restore", project })}
                  className={`${archiveActionBtnBase} border-blue-500 dark:border-blue-400 bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40`}
                >
                  {t("archives.restore")}
                </button>
                <button
                  type="button"
                  onClick={() => setProjectConfirm({ kind: "delete", project })}
                  className={`${archiveActionBtnBase} border-red-500 dark:border-red-500/80 bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40`}
                >
                  {t("archives.deleteForever")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={projectConfirm !== null}
        title={
          projectConfirm == null
            ? ""
            : projectConfirm.kind === "restore"
              ? t("archives.confirmRestoreProjectTitle")
              : projectConfirm.kind === "delete"
                ? t("archives.confirmDeleteProjectTitle")
                : t("archives.confirmPurgeProjectsTitle")
        }
        message={
          projectConfirm == null
            ? ""
            : projectConfirm.kind === "restore"
              ? t("archives.confirmRestoreProjectMessage").replace("{name}", projectConfirm.project.name)
              : projectConfirm.kind === "delete"
                ? t("archives.deleteProjectConfirm")
                : t("archives.emptyProjectsConfirm").replace(
                    "{count}",
                    String(projectConfirm.ids.length),
                  )
        }
        variant={projectConfirm?.kind === "restore" ? "info" : "danger"}
        confirmLabel={
          projectConfirm?.kind === "restore" ? t("archives.restore") : t("archives.deleteForever")
        }
        onCancel={() => setProjectConfirm(null)}
        onConfirm={handleProjectConfirm}
      />
    </div>
  );
}
