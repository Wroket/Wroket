"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthContext";
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

  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectTodos, setProjectTodos] = useState<Todo[]>([]);
  const [loadingTodos, setLoadingTodos] = useState(false);

  const [allProjectTodos, setAllProjectTodos] = useState<Todo[]>([]);

  const loadProjects = useCallback(async () => {
    try {
      const [p, te] = await Promise.all([getProjects(), getTeams()]);
      setProjects(p);
      setTeams(te);
    } catch { /* auth handled by AuthContext */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  useEffect(() => {
    getTodos()
      .then((todos) => setAllProjectTodos(todos.filter((td) => !!td.projectId && !td.parentId)))
      .catch(() => setAllProjectTodos([]));
  }, []);

  const handleSelectProject = async (project: Project) => {
    setSelectedProject(project);
    setLoadingTodos(true);
    try {
      const [freshProj, todos] = await Promise.all([fetchProject(project.id), getProjectTodos(project.id)]);
      setSelectedProject(freshProj);
      setProjectTodos(todos);
    } catch { setProjectTodos([]); }
    finally { setLoadingTodos(false); }
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
        setSelectedProject={setSelectedProject}
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
