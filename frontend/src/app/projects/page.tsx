"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthContext";
import { useToast } from "@/components/Toast";
import {
  getProjects,
  getTeams,
  getTodos,
  getProjectTodos,
  getProject as fetchProject,
  Project,
  Team,
  Todo,
} from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";

import ProjectDetailView from "./_components/ProjectDetailView";
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

  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectTodos, setProjectTodos] = useState<Todo[]>([]);
  const [loadingTodos, setLoadingTodos] = useState(false);

  const [allProjectTodos, setAllProjectTodos] = useState<Todo[]>([]);

  const selectProject = useCallback((project: Project | null) => {
    setSelectedProject(project);
    const params = new URLSearchParams(searchParams.toString());
    if (project) {
      params.set("project", project.id);
    } else {
      params.delete("project");
    }
    router.replace(`/projects?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

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

  useEffect(() => {
    loadProjects().then((loadedProjects) => {
      const projectId = searchParams.get("project");
      if (projectId && !selectedProject) {
        const found = loadedProjects.find((p: Project) => p.id === projectId);
        if (found) handleSelectProject(found);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    getTodos()
      .then((todos) => setAllProjectTodos(todos.filter((td) => !!td.projectId && !td.parentId)))
      .catch(() => setAllProjectTodos([]));
  }, []);

  const handleSelectProject = async (project: Project) => {
    selectProject(project);
    setLoadingTodos(true);
    try {
      const [freshProj, todos] = await Promise.all([fetchProject(project.id), getProjectTodos(project.id)]);
      setSelectedProject(freshProj);
      setProjectTodos(todos);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toast.loadError"));
      setProjectTodos([]);
    } finally {
      setLoadingTodos(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  if (selectedProject) {
    return (
      <ProjectDetailView
        selectedProject={selectedProject}
        setSelectedProject={selectProject}
        projects={projects}
        setProjects={setProjects}
        projectTodos={projectTodos}
        setProjectTodos={setProjectTodos}
        loadingTodos={loadingTodos}
        user={user}
        t={t}
        locale={locale}
        loadProjects={loadProjects}
        teams={teams}
      />
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
    />
  );
}
