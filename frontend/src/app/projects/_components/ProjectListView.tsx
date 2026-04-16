"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";

import AppShell from "@/components/AppShell";
import DashboardImportModal from "@/components/DashboardImportModal";
import PageHelpButton from "@/components/PageHelpButton";
import ConfirmDialog from "@/components/ConfirmDialog";
import TaskImportModal from "@/components/TaskImportModal";
import { useToast } from "@/components/Toast";
import {
  createProject,
  updateProject,
  reorderProjects,
  getProject as fetchProject,
} from "@/lib/api";

import { SortableProjectCard, DraggableSubProjectCard } from "./DndWrappers";
import { formatMins, getHealthConfig, TEMPLATE_PHASES } from "./types";
import type { Project, Team, Todo, TranslationKey, ProjectHealth } from "./types";

type ProjectUndoAction =
  | { type: "archive"; projectId: string; previousStatus: "active" | "archived" }
  | { type: "nest"; projectId: string; previousParentId: string | null }
  | { type: "reorder"; previousIds: string[] };

interface ProjectListViewProps {
  projects: Project[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  teams: Team[];
  allProjectTodos: Todo[];
  user: { uid: string; email?: string; effortMinutes?: { light: number; medium: number; heavy: number } } | null;
  t: (key: TranslationKey) => string;
  locale: string;
  loadProjects: () => Promise<unknown>;
  onSelectProject: (project: Project) => void;
  onTaskImportSuccess?: () => void;
}

export default function ProjectListView({
  projects,
  setProjects,
  teams,
  allProjectTodos,
  user,
  t,
  locale,
  loadProjects,
  onSelectProject,
  onTaskImportSuccess,
}: ProjectListViewProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createTeamId, setCreateTeamId] = useState<string | null>(null);
  const [useTemplate, setUseTemplate] = useState(true);
  const [creating, setCreating] = useState(false);

  const [importChoiceOpen, setImportChoiceOpen] = useState(false);
  const [taskImportFile, setTaskImportFile] = useState<File | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; message: string; action: () => void } | null>(null);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  const [nestTargetId, setNestTargetId] = useState<string | null>(null);
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null);
  const nestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [lastAction, setLastAction] = useState<ProjectUndoAction | null>(null);
  const [undoing, setUndoing] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    if (lastAction) {
      undoTimerRef.current = setTimeout(() => setLastAction(null), 10_000);
    }
    return () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); };
  }, [lastAction]);

  const projectSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const isDescendant = useCallback((parentId: string, childId: string): boolean => {
    const children = projects.filter((p) => p.parentProjectId === parentId);
    for (const c of children) {
      if (c.id === childId) return true;
      if (isDescendant(c.id, childId)) return true;
    }
    return false;
  }, [projects]);

  const isDraggingSubProject = useMemo(() => {
    if (!draggingProjectId) return false;
    const p = projects.find((pr) => pr.id === draggingProjectId);
    return !!p?.parentProjectId;
  }, [draggingProjectId, projects]);

  const timeByProject = useMemo(() => {
    const defaults = user?.effortMinutes ?? { light: 15, medium: 30, heavy: 60 };
    const resolveMin = (td: Todo): number =>
      td.estimatedMinutes ?? defaults[td.effort ?? "medium"] ?? 30;
    const map = new Map<string, number>();
    for (const td of allProjectTodos) {
      const pid = td.projectId!;
      map.set(pid, (map.get(pid) ?? 0) + resolveMin(td));
    }
    return map;
  }, [allProjectTodos, user?.effortMinutes]);

  const taskCountByProject = useMemo(() => {
    const map = new Map<string, number>();
    for (const td of allProjectTodos) {
      if (td.status === "cancelled" || td.status === "deleted") continue;
      const pid = td.projectId!;
      map.set(pid, (map.get(pid) ?? 0) + 1);
    }
    return map;
  }, [allProjectTodos]);

  const completedByProject = useMemo(() => {
    const map = new Map<string, number>();
    for (const td of allProjectTodos) {
      if (td.status === "completed") {
        const pid = td.projectId!;
        map.set(pid, (map.get(pid) ?? 0) + 1);
      }
    }
    return map;
  }, [allProjectTodos]);

  const healthByProject = useMemo(() => {
    const now = new Date();
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    const grouped = new Map<string, Todo[]>();
    for (const td of allProjectTodos) {
      const pid = td.projectId!;
      if (!grouped.has(pid)) grouped.set(pid, []);
      grouped.get(pid)!.push(td);
    }
    const map = new Map<string, ProjectHealth>();
    for (const [pid, todos] of grouped) {
      const active = todos.filter((td) => td.status === "active");
      if (active.length === 0 && todos.some((td) => td.status === "completed")) {
        map.set(pid, "done");
        continue;
      }
      const hasOverdue = active.some((td) => td.deadline && new Date(td.deadline) < now);
      if (hasOverdue) { map.set(pid, "overdue"); continue; }
      const hasAtRisk = active.some((td) =>
        td.priority === "high" ||
        (td.deadline && new Date(td.deadline).getTime() - now.getTime() < threeDaysMs)
      );
      if (hasAtRisk) { map.set(pid, "at-risk"); continue; }
      map.set(pid, "on-track");
    }
    return map;
  }, [allProjectTodos]);

  const activeProjects = useMemo(() => projects.filter((p) => p.status === "active" && !p.parentProjectId), [projects]);
  const childrenByParent = useMemo(() => {
    const map = new Map<string, Project[]>();
    for (const p of projects) {
      if (p.parentProjectId) {
        const arr = map.get(p.parentProjectId) ?? [];
        arr.push(p);
        map.set(p.parentProjectId, arr);
      }
    }
    return map;
  }, [projects]);
  const getChildren = (parentId: string) => childrenByParent.get(parentId) ?? [];

  const getAggregatedTime = (projectId: string): number => {
    let total = timeByProject.get(projectId) ?? 0;
    for (const child of getChildren(projectId)) total += timeByProject.get(child.id) ?? 0;
    return total;
  };

  const getAggregatedTaskCount = (projectId: string): number => {
    let total = taskCountByProject.get(projectId) ?? 0;
    for (const child of getChildren(projectId)) total += taskCountByProject.get(child.id) ?? 0;
    return total;
  };

  const getAggregatedCompleted = (projectId: string): number => {
    let total = completedByProject.get(projectId) ?? 0;
    for (const child of getChildren(projectId)) total += completedByProject.get(child.id) ?? 0;
    return total;
  };

  const getAggregatedHealth = (projectId: string): ProjectHealth => {
    const ids = [projectId, ...getChildren(projectId).map((c) => c.id)];
    const healths = ids.map((id) => healthByProject.get(id)).filter(Boolean) as ProjectHealth[];
    if (healths.length === 0) return "empty";
    if (healths.includes("overdue")) return "overdue";
    if (healths.includes("at-risk")) return "at-risk";
    if (healths.every((h) => h === "done")) return "done";
    return "on-track";
  };

  const healthConfig = useMemo(() => getHealthConfig(t), [t]);

  const teamName = (teamId: string | null) => {
    if (!teamId) return t("projects.personal");
    const team = teams.find((te) => te.id === teamId);
    return team ? team.name : teamId;
  };

  const getUserRole = (project: Project): { label: string; cls: string } => {
    if (project.ownerUid === user?.uid) return { label: t("projects.roleOwner"), cls: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" };
    if (!project.teamId) return { label: t("projects.roleMember"), cls: "bg-zinc-100 text-zinc-600 dark:bg-slate-700 dark:text-slate-400" };
    const team = teams.find((te) => te.id === project.teamId);
    if (!team) return { label: t("projects.roleMember"), cls: "bg-zinc-100 text-zinc-600 dark:bg-slate-700 dark:text-slate-400" };
    if (team.ownerUid === user?.uid) return { label: t("projects.roleOwner"), cls: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" };
    const member = team.members.find((m) => m.email === user?.email);
    if (member?.role === "co-owner") return { label: t("projects.roleCoOwner"), cls: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300" };
    if (member?.role === "admin") return { label: t("projects.roleAdmin"), cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" };
    if (member?.role === "super-user") return { label: t("projects.roleSuperUser"), cls: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300" };
    return { label: t("projects.roleMember"), cls: "bg-zinc-100 text-zinc-600 dark:bg-slate-700 dark:text-slate-400" };
  };

  const getProjectDateRange = (project: Project): { start: string | null; end: string | null } => {
    const phases = project.phases ?? [];
    if (phases.length === 0) return { start: null, end: null };
    const starts = phases.map((p) => p.startDate).filter(Boolean) as string[];
    const ends = phases.map((p) => p.endDate).filter(Boolean) as string[];
    return {
      start: starts.length > 0 ? starts.sort()[0] : null,
      end: ends.length > 0 ? ends.sort().reverse()[0] : null,
    };
  };

  const formatShortDate = (dateStr: string): string => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString(locale === "en" ? "en-US" : "fr-FR", { day: "numeric", month: "short" });
  };

  const toggleExpand = (id: string) => setExpandedProjects((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const closeCreateModal = useCallback(() => {
    if (createName.trim() || createDesc.trim()) {
      if (!window.confirm(t("projects.discardChanges"))) return;
    }
    setShowCreate(false);
    setCreateName("");
    setCreateDesc("");
    setCreateTeamId(null);
    setUseTemplate(true);
  }, [createName, createDesc, t]);

  const handleCreate = async () => {
    if (!createName.trim() || creating) return;
    setCreating(true);
    try {
      let project = await createProject({ name: createName.trim(), description: createDesc.trim(), teamId: createTeamId });
      if (useTemplate) {
        const lang = locale === "fr" ? "fr" : "en";
        const { createPhase } = await import("@/lib/api");
        for (const tpl of TEMPLATE_PHASES) {
          await createPhase(project.id, { name: tpl.name[lang], startDate: null, endDate: null });
        }
        project = await fetchProject(project.id);
      }
      setProjects((prev) => [project, ...prev]);
      setShowCreate(false);
      setCreateName("");
      setCreateDesc("");
      setCreateTeamId(null);
      setUseTemplate(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally { setCreating(false); }
  };

  const handleArchiveRestore = async (project: Project) => {
    const previousStatus = project.status as "active" | "archived";
    const newStatus = previousStatus === "active" ? "archived" : "active";
    try {
      const updated = await updateProject(project.id, { status: newStatus });
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setLastAction({ type: "archive", projectId: project.id, previousStatus });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const handleDelete = (project: Project) => {
    setConfirm({
      title: t("projects.archive"),
      message: `« ${project.name} » — ${t("projects.confirmArchiveHint")}`,
      action: async () => {
        setConfirm(null);
        try {
          const updated = await updateProject(project.id, { status: "archived" });
          setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
          setLastAction({ type: "archive", projectId: project.id, previousStatus: "active" });
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Error");
        }
      },
    });
  };

  const handleUndo = async () => {
    if (!lastAction || undoing) return;
    setUndoing(true);
    try {
      switch (lastAction.type) {
        case "archive": {
          const updated = await updateProject(lastAction.projectId, { status: lastAction.previousStatus });
          setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
          break;
        }
        case "nest": {
          const updated = await updateProject(lastAction.projectId, { parentProjectId: lastAction.previousParentId });
          setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
          break;
        }
        case "reorder": {
          await reorderProjects(lastAction.previousIds);
          await loadProjects();
          break;
        }
      }
      setLastAction(null);
    } catch {
      toast.error(t("toast.cancelError"));
    } finally {
      setUndoing(false);
    }
  };

  const handleProjectDragStart = (event: DragStartEvent) => {
    setDraggingProjectId(event.active.id as string);
    setNestTargetId(null);
  };

  const handleProjectDragOver = (event: { active: { id: string | number }; over: { id: string | number } | null }) => {
    if (nestTimerRef.current) { clearTimeout(nestTimerRef.current); nestTimerRef.current = null; }
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || overId === activeId) { setNestTargetId(null); return; }
    const activeProject = projects.find((p) => p.id === activeId);
    if (activeProject?.parentProjectId) { setNestTargetId(null); return; }
    const hasChildren = projects.some((p) => p.parentProjectId === activeId);
    if (hasChildren) { setNestTargetId(null); return; }
    if (isDescendant(activeId, overId)) { setNestTargetId(null); return; }
    const targetProject = projects.find((p) => p.id === overId);
    if (targetProject?.parentProjectId) { setNestTargetId(null); return; }
    nestTimerRef.current = setTimeout(() => { setNestTargetId(overId); }, 800);
  };

  const handleProjectDragEnd = async (event: DragEndEvent) => {
    if (nestTimerRef.current) { clearTimeout(nestTimerRef.current); nestTimerRef.current = null; }
    const currentNestTarget = nestTargetId;
    const wasDraggingSubProject = isDraggingSubProject;
    setDraggingProjectId(null);
    setNestTargetId(null);

    const { active, over } = event;
    const activeId = String(active.id);

    if (wasDraggingSubProject) {
      const draggedProject = projects.find((p) => p.id === activeId);
      if (!draggedProject?.parentProjectId) return;
      const previousParentId = draggedProject.parentProjectId;
      setProjects((prev) => prev.map((p) => p.id === activeId ? { ...p, parentProjectId: null } : p));
      try {
        await updateProject(activeId, { parentProjectId: null });
        setLastAction({ type: "nest", projectId: activeId, previousParentId });
      } catch (err) { toast.error(err instanceof Error ? err.message : "Error"); loadProjects(); }
      return;
    }

    if (!over || active.id === over.id) return;
    const overId = String(over.id);

    if (currentNestTarget && currentNestTarget === overId) {
      const draggedProject = projects.find((p) => p.id === activeId);
      const targetProject = projects.find((p) => p.id === overId);
      if (!draggedProject || !targetProject) return;
      if (isDescendant(activeId, overId)) return;
      if (targetProject.parentProjectId) return;
      const previousParentId = draggedProject.parentProjectId;
      setProjects((prev) => prev.map((p) => p.id === activeId ? { ...p, parentProjectId: overId } : p));
      try {
        await updateProject(activeId, { parentProjectId: overId });
        setLastAction({ type: "nest", projectId: activeId, previousParentId });
      } catch (err) { toast.error(err instanceof Error ? err.message : "Error"); loadProjects(); }
      return;
    }

    const oldIdx = activeProjects.findIndex((p) => p.id === activeId);
    const newIdx = activeProjects.findIndex((p) => p.id === overId);
    if (oldIdx === -1 || newIdx === -1) return;
    const previousIds = activeProjects.map((p) => p.id);
    const reordered = arrayMove(activeProjects, oldIdx, newIdx);
    const reorderedIds = reordered.map((p) => p.id);
    setProjects((prev) => {
      const others = prev.filter((p) => p.status !== "active" || !!p.parentProjectId);
      const updated = reordered.map((p, i) => ({ ...p, sortOrder: i }));
      return [...updated, ...others];
    });
    try {
      await reorderProjects(reorderedIds);
      setLastAction({ type: "reorder", previousIds });
    } catch { loadProjects(); }
  };

  const handleProjectDragCancel = () => {
    if (nestTimerRef.current) { clearTimeout(nestTimerRef.current); nestTimerRef.current = null; }
    setDraggingProjectId(null);
    setNestTargetId(null);
  };

  return (
    <AppShell>
      <div className="max-w-[1000px] mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-slate-100">{t("projects.title")}</h2>
              <PageHelpButton
                title={t("projects.title")}
                items={[
                  { text: t("help.projects.create") },
                  { text: t("help.projects.views") },
                  { text: t("help.projects.kanbanDnd") },
                  { text: t("help.projects.gantt") },
                  { text: t("help.projects.import") },
                  { text: t("help.projects.undo") },
                ]}
              />
            </div>
            <p className="text-sm text-zinc-500 dark:text-slate-400 mt-1">{t("projects.subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleUndo}
              disabled={!lastAction || undoing}
              title={t("todos.undoTitle")}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                lastAction
                  ? "border-zinc-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-700"
                  : "border-zinc-100 dark:border-slate-700 bg-zinc-50 dark:bg-slate-800/50 text-zinc-300 dark:text-slate-600 cursor-not-allowed"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
              </svg>
              <span className="hidden sm:inline">{t("todos.undo")}</span>
            </button>
            <button
              type="button"
              onClick={() => setImportChoiceOpen(true)}
              className="inline-flex items-center gap-2 rounded border border-zinc-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-zinc-800 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-700 transition-colors"
            >
              <svg className="w-4 h-4 shrink-0 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {t("dashboard.importData")}
            </button>
            <button onClick={() => setShowCreate(true)} className="rounded bg-slate-700 dark:bg-slate-600 px-4 py-2 text-sm font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 transition-colors">{t("projects.create")}</button>
          </div>
        </div>

        {projects.length === 0 && !showCreate ? (
          <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-10 text-center">
            <svg className="w-12 h-12 mx-auto text-zinc-300 dark:text-slate-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <p className="text-sm text-zinc-500 dark:text-slate-400">{t("projects.empty")}</p>
          </div>
        ) : (
          <DndContext sensors={projectSensors} collisionDetection={closestCenter} onDragStart={handleProjectDragStart} onDragOver={handleProjectDragOver} onDragEnd={handleProjectDragEnd} onDragCancel={handleProjectDragCancel}>
          <SortableContext items={activeProjects.map((p) => p.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeProjects.map((project) => {
              const children = getChildren(project.id);
              const expanded = expandedProjects.has(project.id);
              return (
                <SortableProjectCard key={project.id} id={project.id} isNesting={!!nestTargetId}>
                  <div
                    onClick={() => onSelectProject(project)}
                    className={`bg-white dark:bg-slate-900 rounded-md border p-4 cursor-pointer hover:shadow-md transition-all group min-h-[120px] flex-1 ${
                      nestTargetId === project.id
                        ? "border-blue-500 dark:border-blue-400 ring-2 ring-blue-300 dark:ring-blue-600 shadow-lg scale-[1.02]"
                        : "border-zinc-200 dark:border-slate-700 dark:hover:border-slate-500"
                    }`}
                  >
                    {nestTargetId === project.id && (
                      <div className="mb-2 text-center text-[11px] font-semibold text-blue-600 dark:text-blue-400 animate-pulse">{t("projects.dropToNest")}</div>
                    )}
                    <div className="flex items-start justify-between">
                      <h3 className="font-semibold text-zinc-900 dark:text-slate-100 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">{project.name}</h3>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        <button onClick={(e) => { e.stopPropagation(); handleArchiveRestore(project); }} className="text-zinc-400 hover:text-amber-500 transition-colors" title={t("projects.archive")}>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                        </button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); handleDelete(project); }} className="text-zinc-400 hover:text-amber-600 transition-colors" title={t("projects.archive")}>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                    {project.description && <p className="text-xs text-zinc-500 dark:text-slate-400 mt-1 line-clamp-2">{project.description}</p>}

                    {/* Meta: role, team, dates */}
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-1.5">
                        {(() => {
                          const role = getUserRole(project);
                          return <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${role.cls}`}>{role.label}</span>;
                        })()}
                        <span className="text-[10px] text-zinc-400 dark:text-slate-500">{teamName(project.teamId)}</span>
                      </div>
                      {(() => {
                        const { start, end } = getProjectDateRange(project);
                        if (!start && !end) return null;
                        return (
                          <span className="text-[10px] text-zinc-400 dark:text-slate-500 flex items-center gap-0.5">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            {start ? formatShortDate(start) : "?"} — {end ? formatShortDate(end) : "?"}
                          </span>
                        );
                      })()}
                    </div>

                    {(project.tags?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {project.tags.map((tag) => (
                          <span key={tag} className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">{tag}</span>
                        ))}
                      </div>
                    )}
                    {(() => {
                      const total = getAggregatedTaskCount(project.id);
                      const done = getAggregatedCompleted(project.id);
                      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                      const health = getAggregatedHealth(project.id);
                      const hc = healthConfig[health];
                      const totalTime = getAggregatedTime(project.id);
                      const barColor = pct === 100 ? "bg-emerald-500" : pct >= 50 ? "bg-blue-500" : pct > 0 ? "bg-amber-400" : "bg-zinc-200 dark:bg-slate-700";
                      return (
                        <div className="mt-3 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-zinc-500 dark:text-slate-400">
                              {total > 0 ? `${done}/${total} ${t("projects.tasksProgress")}` : `0 ${t("projects.tasksProgress")}`}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {totalTime > 0 && (
                                <span className="text-[10px] font-medium text-blue-500 dark:text-blue-400 flex items-center gap-0.5">
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                  {formatMins(totalTime)}
                                </span>
                              )}
                              {health !== "empty" && (
                                <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${hc.bg} ${hc.color}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${hc.ring}`} />
                                  {hc.label}
                                </span>
                              )}
                            </div>
                          </div>
                          {total > 0 && (
                            <div className="w-full h-1.5 rounded-full bg-zinc-100 dark:bg-slate-800 overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    {children.length > 0 && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); toggleExpand(project.id); }} className="flex items-center gap-1 mt-3 pt-2 border-t border-zinc-100 dark:border-slate-800 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 w-full">
                        <svg className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                        {children.length} {t("projects.subProjects").toLowerCase()}
                      </button>
                    )}
                  </div>
                  {expanded && children.length > 0 && (
                    <div className="relative z-10 ml-8 mt-1 space-y-1 border-l-2 border-blue-200 dark:border-blue-800 pl-3">
                      {children.map((child) => (
                        <DraggableSubProjectCard key={child.id} id={child.id}>
                        <div onClick={() => onSelectProject(child)} className="bg-white dark:bg-slate-900 rounded border border-zinc-200 dark:border-slate-700 px-3 py-2 cursor-pointer hover:shadow-sm hover:border-blue-300 dark:hover:border-blue-700 transition-all group">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <svg className="w-3.5 h-3.5 text-blue-400 dark:text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                              <span className="text-sm text-zinc-700 dark:text-slate-300 truncate">{child.name}</span>
                              {(timeByProject.get(child.id) ?? 0) > 0 && (
                                <span className="text-[10px] font-semibold text-blue-500 dark:text-blue-400 shrink-0 flex items-center gap-0.5">
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                  {formatMins(timeByProject.get(child.id)!)}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-all">
                              <button onClick={async (e) => { e.stopPropagation(); try { const updated = await updateProject(child.id, { parentProjectId: null }); setProjects((prev) => prev.map((p) => p.id === updated.id ? updated : p)); } catch { loadProjects(); } }} className="text-zinc-300 dark:text-slate-600 hover:text-blue-500 transition-colors" title={t("projects.promoteToRoot")}>
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                              </button>
                              <button type="button" onClick={(e) => { e.stopPropagation(); handleDelete(child); }} className="text-zinc-300 dark:text-slate-600 hover:text-amber-600 transition-colors" title={t("projects.archive")}>
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </div>
                          </div>
                          {(child.tags?.length ?? 0) > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {child.tags.map((tag) => (
                                <span key={tag} className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 text-[9px] font-medium text-blue-700 dark:text-blue-300">{tag}</span>
                              ))}
                            </div>
                          )}
                          {(() => {
                            const ct = taskCountByProject.get(child.id) ?? 0;
                            const cd = completedByProject.get(child.id) ?? 0;
                            const cp = ct > 0 ? Math.round((cd / ct) * 100) : 0;
                            const ch = healthByProject.get(child.id) ?? ("empty" as ProjectHealth);
                            const chc = healthConfig[ch];
                            const cbar = cp === 100 ? "bg-emerald-500" : cp >= 50 ? "bg-blue-500" : cp > 0 ? "bg-amber-400" : "bg-zinc-200 dark:bg-slate-700";
                            if (ct === 0) return null;
                            return (
                              <div className="mt-1.5 space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-[9px] text-zinc-400 dark:text-slate-500">{cd}/{ct}</span>
                                  {ch !== "empty" && (
                                    <span className={`inline-flex items-center gap-0.5 rounded-full px-1 py-0.5 text-[8px] font-semibold ${chc.bg} ${chc.color}`}>
                                      <span className={`w-1 h-1 rounded-full ${chc.ring}`} />
                                      {chc.label}
                                    </span>
                                  )}
                                </div>
                                <div className="w-full h-1 rounded-full bg-zinc-100 dark:bg-slate-800 overflow-hidden">
                                  <div className={`h-full rounded-full transition-all ${cbar}`} style={{ width: `${cp}%` }} />
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                        </DraggableSubProjectCard>
                      ))}
                    </div>
                  )}
                </SortableProjectCard>
              );
            })}
          </div>
          </SortableContext>
          <DragOverlay dropAnimation={null}>
            {draggingProjectId && (() => {
              const dp = projects.find((p) => p.id === draggingProjectId);
              if (!dp) return null;
              return (
                <div className="bg-white dark:bg-slate-900 rounded-md border-2 border-blue-400 dark:border-blue-500 shadow-xl p-4 w-72 opacity-90 rotate-1">
                  <h3 className="font-semibold text-zinc-900 dark:text-slate-100 text-sm">{dp.name}</h3>
                  {dp.description && <p className="text-[10px] text-zinc-500 dark:text-slate-400 mt-1 line-clamp-1">{dp.description}</p>}
                </div>
              );
            })()}
          </DragOverlay>
          </DndContext>
        )}

        {/* Create project modal */}
        {showCreate && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={closeCreateModal}>
            <div className="bg-white dark:bg-slate-900 rounded-lg shadow-2xl border border-zinc-200 dark:border-slate-700 w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-slate-100 mb-4">{t("projects.create")}</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("projects.name")}</label>
                  <input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder={t("projects.namePlaceholder")} className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("projects.description")}</label>
                  <textarea value={createDesc} onChange={(e) => setCreateDesc(e.target.value)} placeholder={t("projects.descPlaceholder")} rows={2} className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("projects.team")}</label>
                  <select value={createTeamId ?? ""} onChange={(e) => setCreateTeamId(e.target.value || null)} className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100">
                    <option value="">{t("projects.personal")}</option>
                    {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                  </select>
                </div>
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input type="checkbox" checked={useTemplate} onChange={(e) => setUseTemplate(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-zinc-300 dark:border-slate-600 text-slate-700 focus:ring-slate-500 dark:bg-slate-800" />
                  <div>
                    <span className="text-sm font-medium text-zinc-700 dark:text-slate-300 group-hover:text-zinc-900 dark:group-hover:text-slate-100 transition-colors">{t("projects.useTemplate")}</span>
                    <p className="text-[11px] text-zinc-400 dark:text-slate-500 mt-0.5 leading-snug">{t("projects.templateStandard")}</p>
                  </div>
                </label>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    closeCreateModal();
                  }}
                  className="rounded border border-zinc-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
                >
                  {t("projects.cancel")}
                </button>
                <button type="button" onClick={handleCreate} disabled={!createName.trim() || creating} className="rounded bg-slate-700 dark:bg-slate-600 px-4 py-2 text-sm font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-60 transition-colors">{t("projects.save")}</button>
              </div>
            </div>
          </div>
        )}

        <ConfirmDialog open={!!confirm} title={confirm?.title ?? ""} message={confirm?.message ?? ""} onConfirm={() => confirm?.action()} onCancel={() => setConfirm(null)} variant="warning" confirmLabel={t("projects.archive")} />

        <DashboardImportModal
          open={importChoiceOpen}
          onClose={() => setImportChoiceOpen(false)}
          onTasksFile={(f) => setTaskImportFile(f)}
          onImportProject={() => router.push("/projects/import")}
        />
        <TaskImportModal
          file={taskImportFile}
          open={taskImportFile !== null}
          onClose={() => setTaskImportFile(null)}
          onSuccess={() => {
            if (onTaskImportSuccess) onTaskImportSuccess();
            else void loadProjects();
          }}
        />
      </div>
    </AppShell>
  );
}
