"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthContext";
import { useToast } from "@/components/Toast";
import {
  getProjects,
  getTeams,
  getAllProjectTodos,
  Project,
  Team,
  Todo,
} from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import { useResourceSync } from "@/lib/useResourceSync";
import { useTodoListSync } from "@/lib/useTodoListSync";

import ProjectListView from "./_components/ProjectListView";

export default function ProjectsPage() {
  const { t, locale } = useLocale();
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [allProjectTodos, setAllProjectTodos] = useState<Todo[]>([]);

  const refreshAllTodos = useCallback(() => {
    getAllProjectTodos()
      .then((grouped) => {
        const flat: Todo[] = [];
        for (const todos of Object.values(grouped)) flat.push(...todos);
        setAllProjectTodos(flat);
      })
      .catch(() => setAllProjectTodos([]));
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const [p, te] = await Promise.all([getProjects(), getTeams()]);
      setProjects(p);
      setTeams(te);
      return p;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toast.loadError"));
      return [] as Project[];
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  const handleTaskImportSuccess = useCallback(() => {
    void loadProjects();
    refreshAllTodos();
  }, [loadProjects, refreshAllTodos]);

  const handleSelectProject = useCallback((project: Project) => {
    router.push(`/projects/${encodeURIComponent(project.id)}`);
  }, [router]);

  useResourceSync("projects", loadProjects, { pollIntervalMs: 120_000 });
  useTodoListSync(refreshAllTodos, { pollIntervalMs: 120_000 });

  useEffect(() => {
    const legacyProjectId = searchParams.get("project");
    if (legacyProjectId) {
      router.replace(`/projects/${encodeURIComponent(legacyProjectId)}`);
    }
  }, [searchParams, router]);

  useEffect(() => {
    void loadProjects();
    refreshAllTodos();
  }, [loadProjects, refreshAllTodos]);

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  return (
    <ProjectListView
      projects={projects}
      setProjects={setProjects}
      teams={teams}
      allProjectTodos={allProjectTodos}
      user={user}
      t={t}
      locale={locale}
      loadProjects={loadProjects}
      onSelectProject={handleSelectProject}
      onTaskImportSuccess={handleTaskImportSuccess}
    />
  );
}
