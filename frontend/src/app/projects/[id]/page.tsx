"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthContext";
import { useToast } from "@/components/Toast";
import {
  getProjects,
  getTeams,
  getProject as fetchProject,
  getProjectTodos,
  Project,
  Team,
  Todo,
} from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import { useResourceSync } from "@/lib/useResourceSync";
import { useTodoListSync } from "@/lib/useTodoListSync";

import ProjectDetailView from "../_components/ProjectDetailView";

export default function ProjectDetailPage() {
  const { t, locale } = useLocale();
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams();
  const projectId = typeof params.id === "string" ? params.id : "";

  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectTodos, setProjectTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProjects = useCallback(async () => {
    try {
      const [p, te] = await Promise.all([getProjects(), getTeams()]);
      setProjects(p);
      setTeams(te);
      return p;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toast.loadError"));
      return [] as Project[];
    }
  }, [toast, t]);

  const handleTaskImportSuccess = useCallback(() => {
    void loadProjects();
    if (!projectId) return;
    void getProjectTodos(projectId).then(setProjectTodos).catch(() => setProjectTodos([]));
  }, [loadProjects, projectId]);

  const goBackToList = useCallback(() => {
    router.push("/projects");
  }, [router]);

  useResourceSync("projects", loadProjects, { pollIntervalMs: 120_000 });
  useTodoListSync(() => {
    if (!projectId) return;
    void getProjectTodos(projectId).then(setProjectTodos).catch(() => setProjectTodos([]));
  }, { pollIntervalMs: 120_000 });

  useEffect(() => {
    if (!projectId) {
      router.replace("/projects");
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [freshProj, todos, projs, te] = await Promise.all([
          fetchProject(projectId),
          getProjectTodos(projectId),
          getProjects(),
          getTeams(),
        ]);
        if (cancelled) return;
        setSelectedProject(freshProj);
        setProjectTodos(todos);
        setProjects(projs);
        setTeams(te);
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : t("toast.loadError"));
          router.replace("/projects");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, router, toast, t]);

  if (loading || !selectedProject) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  return (
    <ProjectDetailView
      selectedProject={selectedProject}
      setSelectedProject={(p) => { if (p === null) goBackToList(); else setSelectedProject(p); }}
      projects={projects}
      setProjects={setProjects}
      projectTodos={projectTodos}
      setProjectTodos={setProjectTodos}
      loadingTodos={false}
      user={user}
      t={t}
      locale={locale}
      loadProjects={loadProjects}
      teams={teams}
      onTaskImportSuccess={handleTaskImportSuccess}
    />
  );
}
