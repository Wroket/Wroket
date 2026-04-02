"use client";

import { useState, useMemo, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";

import AppShell from "@/components/AppShell";
import ConfirmDialog from "@/components/ConfirmDialog";
import SubtaskModal from "@/components/SubtaskModal";
import TaskEditModal from "@/components/TaskEditModal";
import { useToast } from "@/components/Toast";
import {
  updateProject,
  getProjectTodos,
  getTodos,
  createTodo,
  updateTodo,
  deleteTodo as apiDeleteTodo,
  createPhase,
  updatePhaseApi,
  deletePhaseApi,
  getProject as fetchProject,
  createProject,
  lookupUser,
} from "@/lib/api";
import { deadlineLabel } from "@/lib/deadlineUtils";
import { EFFORT_BADGES } from "@/lib/effortBadges";
import { PRIORITY_BADGES } from "@/lib/todoConstants";
import { useUserLookup } from "@/lib/userUtils";

import GanttChart from "./GanttChart";
import { DroppablePhaseColumn, DraggableKanbanCard } from "./DndWrappers";
import { formatMins, TEMPLATE_PHASES } from "./types";
import type { Project, ProjectPhase, Todo, Priority, Effort, TodoStatus, AuthMeResponse, TranslationKey, DetailTab } from "./types";

interface ProjectDetailViewProps {
  selectedProject: Project;
  setSelectedProject: (p: Project | null) => void;
  projects: Project[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  projectTodos: Todo[];
  setProjectTodos: React.Dispatch<React.SetStateAction<Todo[]>>;
  loadingTodos: boolean;
  user: { uid: string; effortMinutes?: { light: number; medium: number; heavy: number } } | null;
  t: (key: TranslationKey) => string;
  locale: string;
  loadProjects: () => Promise<void>;
}

export default function ProjectDetailView({
  selectedProject,
  setSelectedProject,
  projects,
  setProjects,
  projectTodos,
  setProjectTodos,
  loadingTodos,
  user,
  t,
  locale,
  loadProjects,
}: ProjectDetailViewProps) {
  const { toast } = useToast();
  const { resolveUser, displayName, cache } = useUserLookup();
  const meUid = user?.uid ?? null;

  const [detailTab, setDetailTab] = useState<DetailTab>("board");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const [showAddPhase, setShowAddPhase] = useState(false);
  const [newPhaseName, setNewPhaseName] = useState("");
  const [newPhaseStart, setNewPhaseStart] = useState("");
  const [newPhaseEnd, setNewPhaseEnd] = useState("");

  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null);
  const [editPhaseName, setEditPhaseName] = useState("");
  const [editPhaseStart, setEditPhaseStart] = useState("");
  const [editPhaseEnd, setEditPhaseEnd] = useState("");

  const [showAddTask, setShowAddTask] = useState(false);
  const [addTaskPhaseId, setAddTaskPhaseId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>("medium");
  const [newTaskEffort, setNewTaskEffort] = useState<Effort>("medium");
  const [newTaskStartDate, setNewTaskStartDate] = useState("");
  const [newTaskDeadline, setNewTaskDeadline] = useState("");

  const [allTodos, setAllTodos] = useState<Todo[]>([]);
  const [showLinkTask, setShowLinkTask] = useState(false);
  const [linkPhaseId, setLinkPhaseId] = useState<string | null>(null);

  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [editForm, setEditForm] = useState({ title: "", priority: "medium" as Priority, effort: "medium" as Effort, deadline: "", assignedTo: "" as string | null, estimatedMinutes: null as number | null, tags: [] as string[], recurrence: null as import("@/lib/api").Recurrence | null, projectId: null as string | null });
  const [editAssignEmail, setEditAssignEmail] = useState("");
  const [editAssignedUser, setEditAssignedUser] = useState<AuthMeResponse | null>(null);
  const [editAssignError, setEditAssignError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const [subtaskParent, setSubtaskParent] = useState<Todo | null>(null);
  const [subtaskSubmitting, setSubtaskSubmitting] = useState(false);

  const [confirm, setConfirm] = useState<{ title: string; message: string; action: () => void } | null>(null);
  const [showCreateSub, setShowCreateSub] = useState(false);
  const [subName, setSubName] = useState("");
  const [creatingSub, setCreatingSub] = useState(false);
  const [newTag, setNewTag] = useState("");

  const [draggedTodoId, setDraggedTodoId] = useState<string | null>(null);

  const kanbanSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const orderedPhases = useMemo(
    () => [...(selectedProject?.phases ?? [])].sort((a, b) => a.order - b.order),
    [selectedProject?.phases],
  );

  const tasksByPhase = useMemo(() => {
    const map = new Map<string | "__none__", Todo[]>();
    map.set("__none__", []);
    for (const p of orderedPhases) map.set(p.id, []);
    for (const td of projectTodos) {
      const key = td.phaseId && map.has(td.phaseId) ? td.phaseId : "__none__";
      map.get(key)!.push(td);
    }
    return map;
  }, [orderedPhases, projectTodos]);

  const subtasksByParent = useMemo(() => {
    const map: Record<string, Todo[]> = {};
    for (const td of projectTodos) {
      if (td.parentId) (map[td.parentId] ??= []).push(td);
    }
    return map;
  }, [projectTodos]);
  const getSubtasks = (parentId: string) => subtasksByParent[parentId] ?? [];

  const effortDefaults = user?.effortMinutes ?? { light: 15, medium: 30, heavy: 60 };
  const timeByPhase = useMemo(() => {
    const resolveMinutes = (td: Todo): number =>
      td.estimatedMinutes ?? effortDefaults[td.effort ?? "medium"] ?? 30;
    const map = new Map<string, number>();
    let total = 0;
    for (const td of projectTodos) {
      if (td.parentId) continue;
      const mins = resolveMinutes(td);
      total += mins;
      const key = td.phaseId ?? "__none__";
      map.set(key, (map.get(key) ?? 0) + mins);
    }
    return { byPhase: map, total };
  }, [projectTodos, effortDefaults]);

  const draggedTodo = useMemo(
    () => (draggedTodoId ? projectTodos.find((t) => t.id === draggedTodoId) ?? null : null),
    [draggedTodoId, projectTodos],
  );

  const subProjects = useMemo(
    () => projects.filter((p) => p.parentProjectId === selectedProject.id),
    [projects, selectedProject.id],
  );

  const parentProject = useMemo(
    () => selectedProject.parentProjectId ? projects.find((p) => p.id === selectedProject.parentProjectId) ?? null : null,
    [projects, selectedProject.parentProjectId],
  );

  const refreshProject = async (id: string) => {
    try {
      const [proj, todos] = await Promise.all([fetchProject(id), getProjectTodos(id)]);
      setSelectedProject(proj);
      setProjectTodos(todos);
      setProjects((prev) => prev.map((p) => (p.id === proj.id ? proj : p)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const handleSelectProject = async (project: Project) => {
    setSelectedProject(project);
    setEditing(false);
    setDetailTab("board");
    try {
      const [freshProj, todos] = await Promise.all([fetchProject(project.id), getProjectTodos(project.id)]);
      setSelectedProject(freshProj);
      setProjectTodos(todos);
    } catch { setProjectTodos([]); }
  };

  const handleSaveEdit = async () => {
    if (!editName.trim()) return;
    try {
      const updated = await updateProject(selectedProject.id, { name: editName.trim(), description: editDesc.trim() });
      setSelectedProject(updated);
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const handleArchiveRestore = async (project: Project) => {
    const newStatus = project.status === "active" ? "archived" : "active";
    try {
      const updated = await updateProject(project.id, { status: newStatus });
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      if (selectedProject.id === updated.id) setSelectedProject(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const handleAddPhase = async () => {
    if (!newPhaseName.trim()) return;
    try {
      await createPhase(selectedProject.id, {
        name: newPhaseName.trim(),
        startDate: newPhaseStart || null,
        endDate: newPhaseEnd || null,
      });
      await refreshProject(selectedProject.id);
      setNewPhaseName("");
      setNewPhaseStart("");
      setNewPhaseEnd("");
      setShowAddPhase(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const handleSavePhase = async () => {
    if (!editingPhaseId || !editPhaseName.trim()) return;
    try {
      await updatePhaseApi(selectedProject.id, editingPhaseId, {
        name: editPhaseName.trim(),
        startDate: editPhaseStart || null,
        endDate: editPhaseEnd || null,
      });
      await refreshProject(selectedProject.id);
      setEditingPhaseId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const handleDeletePhase = (phaseId: string) => {
    const phaseName = orderedPhases.find(p => p.id === phaseId)?.name ?? "";
    setConfirm({
      title: t("phase.delete" as TranslationKey),
      message: phaseName,
      action: async () => {
        setConfirm(null);
        try {
          await deletePhaseApi(selectedProject.id, phaseId);
          const tasksInPhase = projectTodos.filter((td) => td.phaseId === phaseId);
          await Promise.all(tasksInPhase.map((task) => updateTodo(task.id, { phaseId: null })));
          await refreshProject(selectedProject.id);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Error");
        }
      },
    });
  };

  const handleMoveTaskToPhase = async (taskId: string, phaseId: string | null) => {
    try {
      const updated = await updateTodo(taskId, { phaseId });
      setProjectTodos((prev) => prev.map((td) => (td.id === updated.id ? updated : td)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const handleKanbanDragStart = useCallback((event: DragStartEvent) => {
    setDraggedTodoId(String(event.active.id));
  }, []);

  const handleKanbanDragEnd = useCallback((event: DragEndEvent) => {
    setDraggedTodoId(null);
    const { active, over } = event;
    if (!over) return;
    const todoId = String(active.id);
    const newPhaseId = String(over.id);
    const todo = projectTodos.find((t) => t.id === todoId);
    if (!todo) return;
    const currentPhaseId = todo.phaseId ?? "__none__";
    if (currentPhaseId === newPhaseId) return;
    handleMoveTaskToPhase(todoId, newPhaseId === "__none__" ? null : newPhaseId);
  }, [projectTodos, handleMoveTaskToPhase]);

  const openEdit = (todo: Todo) => {
    setEditingTodo(todo);
    setEditForm({
      title: todo.title,
      priority: todo.priority,
      effort: todo.effort ?? "medium",
      deadline: todo.deadline ?? "",
      assignedTo: todo.assignedTo ?? null,
      estimatedMinutes: todo.estimatedMinutes ?? null,
      tags: todo.tags ?? [],
      recurrence: todo.recurrence ?? null,
      projectId: todo.projectId ?? null,
    });
    setEditAssignEmail("");
    setEditAssignedUser(null);
    setEditAssignError(null);
    if (todo.assignedTo && !cache[todo.assignedTo]) {
      resolveUser(todo.assignedTo);
    }
  };

  const saveEdit = async () => {
    if (!editingTodo) return;
    setEditSaving(true);
    try {
      const updated = await updateTodo(editingTodo.id, {
        title: editForm.title,
        priority: editForm.priority,
        effort: editForm.effort,
        deadline: editForm.deadline || null,
        assignedTo: editForm.assignedTo,
        estimatedMinutes: editForm.estimatedMinutes,
        tags: editForm.tags,
        recurrence: editForm.recurrence,
        projectId: editForm.projectId,
      });
      setProjectTodos((prev) => prev.map((td) => (td.id === updated.id ? updated : td)));
      setEditingTodo(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setEditSaving(false);
    }
  };

  const handleEditAssignLookup = async (email: string) => {
    setEditAssignEmail(email);
    setEditAssignError(null);
    if (!email.includes("@") || email.length < 5) {
      setEditAssignedUser(null);
      return;
    }
    try {
      const found = await lookupUser(email);
      if (found) {
        setEditAssignedUser(found);
        setEditAssignError(null);
        setEditForm((f) => ({ ...f, assignedTo: found.uid }));
      } else {
        setEditAssignedUser(null);
        setEditAssignError(t("assign.userNotFound" as TranslationKey));
      }
    } catch {
      setEditAssignedUser(null);
    }
  };

  const openSubtaskModal = (todo: Todo) => setSubtaskParent(todo);

  const handleCreateSubtask = async (data: { title: string; priority: Priority; effort: Effort; deadline: string }) => {
    if (!subtaskParent) return;
    setSubtaskSubmitting(true);
    try {
      const todo = await createTodo({
        title: data.title,
        priority: data.priority,
        effort: data.effort,
        deadline: data.deadline || null,
        parentId: subtaskParent.id,
        projectId: selectedProject.id,
        phaseId: subtaskParent.phaseId ?? null,
      });
      setProjectTodos((prev) => [...prev, todo]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setSubtaskSubmitting(false);
    }
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return;
    try {
      const todo = await createTodo({
        title: newTaskTitle.trim(),
        priority: newTaskPriority,
        effort: newTaskEffort,
        startDate: newTaskStartDate || null,
        deadline: newTaskDeadline || null,
        projectId: selectedProject.id,
        phaseId: addTaskPhaseId,
      });
      setProjectTodos((prev) => [...prev, todo]);
      setNewTaskTitle("");
      setNewTaskPriority("medium");
      setNewTaskEffort("medium");
      setNewTaskStartDate("");
      setNewTaskDeadline("");
      setShowAddTask(false);
      setAddTaskPhaseId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const handleLinkExisting = async (todo: Todo, phaseId: string | null) => {
    try {
      const updated = await updateTodo(todo.id, { projectId: selectedProject.id, phaseId });
      setProjectTodos((prev) => [...prev, updated]);
      setAllTodos((prev) => prev.filter((td) => td.id !== todo.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const handleUnlinkTask = async (todo: Todo) => {
    try {
      await updateTodo(todo.id, { projectId: null, phaseId: null });
      setProjectTodos((prev) => prev.filter((td) => td.id !== todo.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const handleTaskStatusChange = async (todo: Todo, status: TodoStatus) => {
    try {
      const updated = await updateTodo(todo.id, { status });
      setProjectTodos((prev) => prev.map((td) => (td.id === updated.id ? updated : td)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const handleDeleteTask = (todo: Todo) => {
    setConfirm({
      title: t("filter.deleted" as TranslationKey),
      message: todo.title,
      action: async () => {
        setConfirm(null);
        try {
          await apiDeleteTodo(todo.id);
          setProjectTodos((prev) => prev.filter((td) => td.id !== todo.id));
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Error");
        }
      },
    });
  };

  const openLinkTask = (phaseId: string | null) => {
    setLinkPhaseId(phaseId);
    setShowLinkTask(true);
    getTodos()
      .then((todos) => setAllTodos(todos.filter((td) => !td.projectId && td.status === "active" && !td.parentId)))
      .catch(() => setAllTodos([]));
  };

  const handleCreateSubProject = async () => {
    if (!subName.trim()) return;
    setCreatingSub(true);
    try {
      const sub = await createProject({ name: subName.trim(), teamId: selectedProject.teamId, parentProjectId: selectedProject.id });
      setProjects((prev) => [sub, ...prev]);
      setSubName("");
      setShowCreateSub(false);
      toast.success(t("projects.addSubProject" as TranslationKey));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setCreatingSub(false);
    }
  };

  const handleAddTag = async () => {
    if (!newTag.trim()) return;
    const tag = newTag.trim();
    const current = selectedProject.tags ?? [];
    if (current.includes(tag)) { setNewTag(""); return; }
    try {
      const updated = await updateProject(selectedProject.id, { tags: [...current, tag] });
      setSelectedProject(updated);
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setNewTag("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const handleRemoveTag = async (tag: string) => {
    const current = selectedProject.tags ?? [];
    try {
      const updated = await updateProject(selectedProject.id, { tags: current.filter((t) => t !== tag) });
      setSelectedProject(updated);
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const handleDelete = (project: Project) => {
    setConfirm({
      title: t("projects.delete" as TranslationKey),
      message: project.name,
      action: async () => {
        setConfirm(null);
        try {
          const { deleteProjectApi } = await import("@/lib/api");
          await deleteProjectApi(project.id);
          setProjects((prev) => prev.filter((p) => p.id !== project.id));
          if (selectedProject.id === project.id) setSelectedProject(null);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Error");
        }
      },
    });
  };

  const teamName = (teamId: string | null) => {
    if (!teamId) return t("projects.personal" as TranslationKey);
    return teamId;
  };

  /* ─── Render helpers ─── */

  const renderTaskRow = (todo: Todo, numbering?: string) => {
    const dl = deadlineLabel(todo.deadline, t);
    const effortBadge = EFFORT_BADGES[todo.effort ?? "medium"];
    const subtaskCount = getSubtasks(todo.id).length;
    const isParent = !todo.parentId;

    return (
      <div
        key={todo.id}
        className={`flex items-center gap-2 px-3 py-2 rounded border border-zinc-100 dark:border-slate-800 bg-white dark:bg-slate-900 hover:shadow-sm transition-all group/task select-none ${todo.status !== "active" ? "opacity-50" : ""}`}
        onDoubleClick={(e) => { e.preventDefault(); openEdit(todo); }}
      >
        {numbering && (
          <span className="text-[10px] font-mono font-semibold text-zinc-400 dark:text-slate-500 shrink-0 w-8 text-right">{numbering}</span>
        )}
        {todo.status === "active" ? (
          <button type="button" onClick={(e) => { e.stopPropagation(); handleTaskStatusChange(todo, "completed"); }} className="w-5 h-5 rounded border border-zinc-300 dark:border-slate-600 flex items-center justify-center text-zinc-400 hover:border-green-500 hover:text-green-500 transition-colors shrink-0">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          </button>
        ) : todo.status === "completed" ? (
          <button type="button" onClick={(e) => { e.stopPropagation(); handleTaskStatusChange(todo, "active"); }} className="w-5 h-5 rounded bg-green-500 border border-green-500 flex items-center justify-center text-white shrink-0">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          </button>
        ) : (
          <button type="button" onClick={(e) => { e.stopPropagation(); handleTaskStatusChange(todo, "active"); }} className="w-5 h-5 rounded border border-zinc-300 dark:border-slate-600 flex items-center justify-center text-zinc-400 hover:border-blue-500 hover:text-blue-500 transition-colors shrink-0">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>
        )}

        {isParent && (
          <button type="button" onClick={(e) => { e.stopPropagation(); openSubtaskModal(todo); }} className="text-zinc-400 dark:text-slate-500 hover:text-blue-500 transition-colors shrink-0" title={t("subtask.add" as TranslationKey)}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
          </button>
        )}

        <span className={`flex-1 text-sm truncate ${todo.status === "completed" ? "line-through text-zinc-400 dark:text-slate-500" : "text-zinc-800 dark:text-slate-200"}`}>
          {todo.title}
          {subtaskCount > 0 && (
            <span className="ml-1.5 text-[10px] font-medium text-blue-500 bg-blue-50 dark:bg-blue-950/40 px-1 py-0.5 rounded">{subtaskCount} ↳</span>
          )}
        </span>

        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${PRIORITY_BADGES[todo.priority].cls}`}>
          {t(`priority.${todo.priority}` as TranslationKey)}
        </span>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${effortBadge.cls}`}>
          {t(effortBadge.tKey)}
        </span>

        {dl && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${dl.cls}`}>{dl.text}</span>}
        {todo.deadline && !dl && <span className="text-[10px] text-zinc-400 dark:text-slate-500 shrink-0">{todo.deadline}</span>}

        {todo.assignedTo && todo.assignedTo !== meUid && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
            ← {displayName(todo.userId)}
          </span>
        )}
        {todo.assignedTo && todo.assignedTo !== todo.userId && todo.userId === meUid && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300">
            → {displayName(todo.assignedTo)}
          </span>
        )}

        {orderedPhases.length > 0 && (
          <select
            value={todo.phaseId ?? ""}
            onChange={(e) => { e.stopPropagation(); handleMoveTaskToPhase(todo.id, e.target.value || null); }}
            className="text-[10px] rounded border border-zinc-200 dark:border-slate-700 bg-transparent text-zinc-500 dark:text-slate-400 px-1 py-0.5 opacity-0 group-hover/task:opacity-100 transition-opacity cursor-pointer"
            title="Move to phase"
            onClick={(e) => e.stopPropagation()}
          >
            <option value="">{t("phase.unassigned" as TranslationKey)}</option>
            {orderedPhases.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}

        <div className="flex items-center gap-0.5 opacity-0 group-hover/task:opacity-100 transition-opacity shrink-0">
          {todo.status === "active" && (
            <button type="button" onClick={(e) => { e.stopPropagation(); handleTaskStatusChange(todo, "cancelled"); }} title={t("filter.cancelled" as TranslationKey)} className="text-zinc-400 hover:text-amber-600 transition-colors p-0.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
            </button>
          )}
          <button type="button" onClick={(e) => { e.stopPropagation(); handleUnlinkTask(todo); }} title="Unlink" className="text-zinc-400 hover:text-orange-500 transition-colors p-0.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.181 8.68a4.503 4.503 0 011.903 6.405m-9.768-2.782L3.56 14.06a4.5 4.5 0 006.364 6.365l.707-.707m6.062-9.192l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-.707.707" /></svg>
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteTask(todo); }} title="Delete" className="text-zinc-400 hover:text-red-500 transition-colors p-0.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      </div>
    );
  };

  let taskCounter = 0;

  const renderTaskWithSubtasks = (todo: Todo) => {
    if (todo.parentId) return null;
    taskCounter++;
    const parentNum = String(taskCounter);
    const subs = getSubtasks(todo.id);
    return (
      <div key={todo.id}>
        {renderTaskRow(todo, parentNum)}
        {subs.length > 0 && (
          <div className="ml-6 pl-3 border-l-2 border-zinc-200 dark:border-slate-700 space-y-1 mt-1 mb-1">
            {subs.map((sub, si) => renderTaskRow(sub, `${parentNum}.${si + 1}`))}
          </div>
        )}
      </div>
    );
  };

  return (
    <AppShell>
      <div className="max-w-[1200px] space-y-4">
        <button type="button" onClick={() => setSelectedProject(null)} className="inline-flex items-center gap-1.5 text-sm text-zinc-500 dark:text-slate-400 hover:text-zinc-700 dark:hover:text-slate-200 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          {t("projects.backToList" as TranslationKey)}
        </button>

        {/* Header */}
        <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-5">
          {editing ? (
            <div className="space-y-3">
              <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400" />
              <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={2} className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400" />
              <div className="flex gap-2">
                <button onClick={handleSaveEdit} className="rounded bg-slate-700 dark:bg-slate-600 px-4 py-2 text-sm font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 transition-colors">{t("settings.save" as TranslationKey)}</button>
                <button onClick={() => setEditing(false)} className="rounded border border-zinc-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors">{t("projects.cancel" as TranslationKey)}</button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-slate-100">{selectedProject.name}</h2>
                {selectedProject.description && <p className="text-sm text-zinc-500 dark:text-slate-400 mt-1">{selectedProject.description}</p>}
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-zinc-400 dark:text-slate-500">{teamName(selectedProject.teamId)}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${selectedProject.status === "active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-zinc-200 text-zinc-600 dark:bg-slate-700 dark:text-slate-400"}`}>
                    {t(`projects.${selectedProject.status}` as TranslationKey)}
                  </span>
                  <span className="text-xs text-zinc-400 dark:text-slate-500">{orderedPhases.length} {t("projects.phases" as TranslationKey).toLowerCase()} · {projectTodos.length} {t("projects.tasks" as TranslationKey)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => { setEditing(true); setEditName(selectedProject.name); setEditDesc(selectedProject.description); }} className="rounded border border-zinc-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors">
                  {t("projects.edit" as TranslationKey)}
                </button>
                <button onClick={() => handleArchiveRestore(selectedProject)} className="rounded border border-zinc-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors">
                  {t((selectedProject.status === "active" ? "projects.archive" : "projects.restore") as TranslationKey)}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Tags */}
        <div className="flex flex-wrap items-center gap-2">
          {(selectedProject.tags ?? []).map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300">
              {tag}
              <button type="button" onClick={() => handleRemoveTag(tag)} className="ml-0.5 text-blue-400 hover:text-red-500 dark:text-blue-400 dark:hover:text-red-400 transition-colors">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </span>
          ))}
          <div className="inline-flex items-center gap-1">
            <input type="text" placeholder={t("projects.tagPlaceholder" as TranslationKey)} value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddTag(); } }} className="w-28 rounded-full border border-dashed border-zinc-300 dark:border-slate-600 bg-transparent px-2.5 py-1 text-xs text-zinc-700 dark:text-slate-300 placeholder:text-zinc-400 dark:placeholder:text-slate-500 focus:border-blue-400 dark:focus:border-blue-500 focus:outline-none" />
            {newTag.trim() && (
              <button type="button" onClick={handleAddTag} className="rounded-full bg-blue-600 dark:bg-blue-500 p-0.5 text-white hover:bg-blue-700 dark:hover:bg-blue-400 transition-colors">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              </button>
            )}
          </div>
        </div>

        {/* Parent project breadcrumb */}
        {parentProject && (
          <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-slate-400">
            <span>{t("projects.parentProject" as TranslationKey)} :</span>
            <button type="button" onClick={() => handleSelectProject(parentProject)} className="text-blue-600 dark:text-blue-400 hover:underline font-medium">{parentProject.name}</button>
          </div>
        )}

        {/* Sub-projects */}
        {(subProjects.length > 0 || selectedProject.status === "active") && (
          <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-zinc-500 dark:text-slate-400 uppercase tracking-wider">{t("projects.subProjects" as TranslationKey)} ({subProjects.length})</h4>
              {selectedProject.status === "active" && !showCreateSub && (
                <button type="button" onClick={() => setShowCreateSub(true)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium">+ {t("projects.addSubProject" as TranslationKey)}</button>
              )}
            </div>
            {showCreateSub && (
              <div className="flex gap-2 mb-3">
                <input type="text" placeholder={t("projects.namePlaceholder" as TranslationKey)} value={subName} onChange={(e) => setSubName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleCreateSubProject(); if (e.key === "Escape") setShowCreateSub(false); }} autoFocus className="flex-1 rounded border border-zinc-300 dark:border-slate-600 px-3 py-1.5 text-sm dark:bg-slate-800 dark:text-slate-100 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400" />
                <button onClick={handleCreateSubProject} disabled={creatingSub || !subName.trim()} className="rounded bg-slate-700 dark:bg-slate-600 px-3 py-1.5 text-xs font-medium text-white dark:text-slate-100 disabled:opacity-40">{t("settings.save" as TranslationKey)}</button>
                <button onClick={() => { setShowCreateSub(false); setSubName(""); }} className="rounded border border-zinc-300 dark:border-slate-600 px-3 py-1.5 text-xs text-zinc-600 dark:text-slate-300">{t("projects.cancel" as TranslationKey)}</button>
              </div>
            )}
            {subProjects.length > 0 && (
              <div className="space-y-1">
                {subProjects.map((sub) => (
                  <button key={sub.id} type="button" onClick={() => handleSelectProject(sub)} className="w-full flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors text-left">
                    <span className="font-medium text-zinc-800 dark:text-slate-200">{sub.name}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${sub.status === "active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-zinc-200 text-zinc-600 dark:bg-slate-700 dark:text-slate-400"}`}>{t(`projects.${sub.status}` as TranslationKey)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Time allocation summary */}
        {!loadingTodos && projectTodos.length > 0 && (
          <div className="rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
            <h4 className="text-xs font-semibold text-zinc-500 dark:text-slate-400 uppercase tracking-wider mb-3">{t("projects.timeAllocation" as TranslationKey)}</h4>
            <div className="flex flex-wrap gap-3">
              {orderedPhases.map((phase) => {
                const mins = timeByPhase.byPhase.get(phase.id) ?? 0;
                if (mins === 0) return null;
                return (
                  <div key={phase.id} className="flex items-center gap-2 rounded-md border border-zinc-100 dark:border-slate-700 px-3 py-1.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: phase.color }} />
                    <span className="text-xs text-zinc-600 dark:text-slate-300">{phase.name}</span>
                    <span className="text-xs font-semibold text-zinc-900 dark:text-slate-100">{formatMins(mins)}</span>
                  </div>
                );
              })}
              {(timeByPhase.byPhase.get("__none__") ?? 0) > 0 && (
                <div className="flex items-center gap-2 rounded-md border border-zinc-100 dark:border-slate-700 px-3 py-1.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-zinc-300 dark:bg-slate-600" />
                  <span className="text-xs text-zinc-600 dark:text-slate-300">{t("projects.unassignedPhase" as TranslationKey)}</span>
                  <span className="text-xs font-semibold text-zinc-900 dark:text-slate-100">{formatMins(timeByPhase.byPhase.get("__none__")!)}</span>
                </div>
              )}
              <div className="flex items-center gap-2 rounded-md border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 ml-auto">
                <span className="text-xs font-medium text-zinc-500 dark:text-slate-400">{t("projects.totalTime" as TranslationKey)}</span>
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{formatMins(timeByPhase.total)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex items-center gap-1 bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-1">
          {(["board", "kanban", "gantt"] as DetailTab[]).map((tab) => (
            <button key={tab} onClick={() => setDetailTab(tab)} className={`flex-1 rounded px-4 py-2 text-sm font-medium transition-colors ${detailTab === tab ? "bg-slate-700 dark:bg-slate-600 text-white dark:text-slate-100" : "text-zinc-500 dark:text-slate-400 hover:text-zinc-700 dark:hover:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-800"}`}>
              {t(`projects.${tab}` as TranslationKey)}
            </button>
          ))}
        </div>

        {loadingTodos ? (
          <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" /></div>
        ) : detailTab === "board" ? (
          <div className="space-y-4">
            {orderedPhases.map((phase) => {
              taskCounter = 0;
              const phaseTasks = tasksByPhase.get(phase.id) ?? [];
              const phaseActive = phaseTasks.filter((td) => td.status === "active");
              const phaseDone = phaseTasks.filter((td) => td.status !== "active");
              const isEditing = editingPhaseId === phase.id;

              return (
                <div key={phase.id} className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 overflow-hidden">
                  <div className="px-4 py-3 border-b border-zinc-200 dark:border-slate-700 flex items-center gap-3">
                    <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: phase.color }} />
                    {isEditing ? (
                      <div className="flex-1 flex items-center gap-2 flex-wrap">
                        <input value={editPhaseName} onChange={(e) => setEditPhaseName(e.target.value)} className="rounded border border-zinc-300 dark:border-slate-600 px-2 py-1 text-sm dark:bg-slate-800 dark:text-slate-100 flex-1 min-w-[120px]" />
                        <input type="date" value={editPhaseStart} onChange={(e) => setEditPhaseStart(e.target.value)} className="rounded border border-zinc-300 dark:border-slate-600 px-2 py-1 text-xs dark:bg-slate-800 dark:text-slate-100" />
                        <input type="date" value={editPhaseEnd} onChange={(e) => setEditPhaseEnd(e.target.value)} className="rounded border border-zinc-300 dark:border-slate-600 px-2 py-1 text-xs dark:bg-slate-800 dark:text-slate-100" />
                        <button onClick={handleSavePhase} className="rounded bg-slate-700 dark:bg-slate-600 px-3 py-1 text-xs font-medium text-white dark:text-slate-100">{t("settings.save" as TranslationKey)}</button>
                        <button onClick={() => setEditingPhaseId(null)} className="text-xs text-zinc-400 hover:text-zinc-600">{t("projects.cancel" as TranslationKey)}</button>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold text-zinc-700 dark:text-slate-300">{phase.name}</h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            {phase.startDate && <span className="text-[10px] text-zinc-400 dark:text-slate-500">{phase.startDate}</span>}
                            {phase.startDate && phase.endDate && <span className="text-[10px] text-zinc-300 dark:text-slate-600">→</span>}
                            {phase.endDate && <span className="text-[10px] text-zinc-400 dark:text-slate-500">{phase.endDate}</span>}
                            <span className="text-[10px] text-zinc-400 dark:text-slate-500">({phaseTasks.length} {t("phase.tasks" as TranslationKey)})</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button type="button" onClick={() => { setAddTaskPhaseId(phase.id); setShowAddTask(true); }} className="text-zinc-400 hover:text-blue-500 transition-colors p-1" title={t("projects.addTask" as TranslationKey)}>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                          </button>
                          <button type="button" onClick={() => openLinkTask(phase.id)} className="text-zinc-400 hover:text-cyan-500 transition-colors p-1" title="Link task">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" /><path strokeLinecap="round" strokeLinejoin="round" d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                          </button>
                          <button type="button" onClick={() => { setEditingPhaseId(phase.id); setEditPhaseName(phase.name); setEditPhaseStart(phase.startDate ?? ""); setEditPhaseEnd(phase.endDate ?? ""); }} className="text-zinc-400 hover:text-amber-500 transition-colors p-1" title={t("phase.edit" as TranslationKey)}>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button type="button" onClick={() => handleDeletePhase(phase.id)} className="text-zinc-400 hover:text-red-500 transition-colors p-1" title={t("phase.delete" as TranslationKey)}>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="p-3 space-y-1.5">
                    {phaseActive.filter(td => !td.parentId).length === 0 && phaseDone.filter(td => !td.parentId).length === 0 ? (
                      <p className="text-xs text-zinc-400 dark:text-slate-500 italic text-center py-4">{t("projects.noTasks" as TranslationKey)}</p>
                    ) : (
                      <>
                        {phaseActive.filter(td => !td.parentId).map(renderTaskWithSubtasks)}
                        {phaseDone.filter(td => !td.parentId).map(renderTaskWithSubtasks)}
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {(() => {
              taskCounter = 0;
              const unassigned = tasksByPhase.get("__none__") ?? [];
              if (unassigned.length === 0 && orderedPhases.length > 0) return null;
              return (
                <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 overflow-hidden">
                  <div className="px-4 py-3 border-b border-zinc-200 dark:border-slate-700 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-zinc-500 dark:text-slate-400">{t("phase.unassigned" as TranslationKey)} ({unassigned.length})</h3>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => { setAddTaskPhaseId(null); setShowAddTask(true); }} className="text-zinc-400 hover:text-blue-500 transition-colors p-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                      </button>
                      <button type="button" onClick={() => openLinkTask(null)} className="text-zinc-400 hover:text-cyan-500 transition-colors p-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" /><path strokeLinecap="round" strokeLinejoin="round" d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                      </button>
                    </div>
                  </div>
                  <div className="p-3 space-y-1.5">
                    {unassigned.filter(td => !td.parentId).length === 0 ? (
                      <p className="text-xs text-zinc-400 dark:text-slate-500 italic text-center py-4">{t("projects.noTasks" as TranslationKey)}</p>
                    ) : unassigned.filter(td => !td.parentId).map(renderTaskWithSubtasks)}
                  </div>
                </div>
              );
            })()}
          </div>
        ) : detailTab === "kanban" ? (
          <DndContext sensors={kanbanSensors} onDragStart={handleKanbanDragStart} onDragEnd={handleKanbanDragEnd}>
            <div className="overflow-x-auto pb-4">
              <div className="flex gap-4" style={{ minWidth: Math.max(orderedPhases.length + 1, 3) * 290 + "px" }}>
                {(() => {
                  const kanbanPhases = orderedPhases.length > 0
                    ? orderedPhases
                    : [{ id: "__none__", name: t("phase.unassigned" as TranslationKey), color: "#94a3b8", order: 0, projectId: "", startDate: null, endDate: null, createdAt: "" } as ProjectPhase];
                  const unassigned = projectTodos.filter((td) => !td.parentId && !td.phaseId);

                  return (
                    <>
                      {kanbanPhases.map((phase) => {
                        const isReal = phase.id !== "__none__";
                        const phaseTasks = isReal ? projectTodos.filter((td) => !td.parentId && td.phaseId === phase.id) : unassigned;
                        const active = phaseTasks.filter((td) => td.status === "active");
                        const completed = phaseTasks.filter((td) => td.status === "completed");
                        const other = phaseTasks.filter((td) => td.status !== "active" && td.status !== "completed");

                        return (
                          <div key={phase.id} className="flex-shrink-0 w-[280px] bg-zinc-50 dark:bg-slate-800/50 rounded-lg border border-zinc-200 dark:border-slate-700 flex flex-col max-h-[calc(100vh-280px)]">
                            <div className="px-3 py-2.5 border-b border-zinc-200 dark:border-slate-700 flex items-center gap-2 shrink-0">
                              <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: phase.color }} />
                              <span className="text-sm font-semibold text-zinc-700 dark:text-slate-200 truncate flex-1">{phase.name}</span>
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-zinc-200 dark:bg-slate-700 text-zinc-600 dark:text-slate-400">{phaseTasks.length}</span>
                            </div>
                            <DroppablePhaseColumn id={phase.id}>
                              {active.length === 0 && completed.length === 0 && other.length === 0 && (
                                <p className="text-xs text-zinc-400 dark:text-slate-500 italic text-center py-4">{t("phase.empty" as TranslationKey)}</p>
                              )}
                              {active.map((todo) => {
                                const dl = deadlineLabel(todo.deadline, t);
                                const subs = getSubtasks(todo.id);
                                return (
                                  <DraggableKanbanCard key={todo.id} id={todo.id}>
                                    <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-2.5 hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing group/card" onDoubleClick={(e) => { e.preventDefault(); openEdit(todo); }}>
                                      <div className="flex items-start gap-2">
                                        <button type="button" onClick={(e) => { e.stopPropagation(); handleTaskStatusChange(todo, "completed"); }} className="w-4 h-4 mt-0.5 rounded border border-zinc-300 dark:border-slate-600 flex items-center justify-center text-zinc-400 hover:border-green-500 hover:text-green-500 transition-colors shrink-0">
                                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                        </button>
                                        <p className="text-sm font-medium text-zinc-800 dark:text-slate-200 leading-snug flex-1 min-w-0">{todo.title}</p>
                                        <div className="flex items-center gap-0.5 opacity-0 group-hover/card:opacity-100 transition-opacity shrink-0">
                                          <button type="button" onClick={(e) => { e.stopPropagation(); openSubtaskModal(todo); }} className="text-zinc-400 hover:text-blue-500 transition-colors p-0.5" title={t("subtask.add" as TranslationKey)}>
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                          </button>
                                          <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteTask(todo); }} className="text-zinc-400 hover:text-red-500 transition-colors p-0.5">
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                          </button>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1 mt-2 flex-wrap">
                                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${PRIORITY_BADGES[todo.priority].cls}`}>{t(`priority.${todo.priority}` as TranslationKey)}</span>
                                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${EFFORT_BADGES[todo.effort ?? "medium"].cls}`}>{t(EFFORT_BADGES[todo.effort ?? "medium"].tKey)}</span>
                                        {dl && <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${dl.cls}`}>{dl.text}</span>}
                                        {subs.length > 0 && <span className="text-[9px] font-medium text-blue-500 bg-blue-50 dark:bg-blue-950/40 px-1 py-0.5 rounded">{subs.length} ↳</span>}
                                        {todo.assignedTo && todo.assignedTo !== meUid && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 truncate max-w-[100px]">← {displayName(todo.userId)}</span>}
                                        {todo.assignedTo && todo.assignedTo !== todo.userId && todo.userId === meUid && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300 truncate max-w-[100px]">→ {displayName(todo.assignedTo)}</span>}
                                      </div>
                                      {subs.length > 0 && (
                                        <div className="mt-2 space-y-1 border-t border-zinc-100 dark:border-slate-800 pt-1.5">
                                          {subs.map((sub) => (
                                            <div key={sub.id} className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-slate-400">
                                              <button type="button" onClick={(e) => { e.stopPropagation(); handleTaskStatusChange(sub, sub.status === "completed" ? "active" : "completed"); }} className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 ${sub.status === "completed" ? "bg-green-500 border-green-500 text-white" : "border-zinc-300 dark:border-slate-600"}`}>
                                                {sub.status === "completed" && <svg className="w-2 h-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                              </button>
                                              <span className={sub.status === "completed" ? "line-through opacity-60" : ""}>{sub.title}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </DraggableKanbanCard>
                                );
                              })}
                              {completed.length > 0 && (
                                <div className="pt-1">
                                  <p className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-slate-500 font-semibold px-1 mb-1">{t("filter.completed" as TranslationKey)}</p>
                                  {completed.map((todo) => (
                                    <DraggableKanbanCard key={todo.id} id={todo.id}>
                                      <div className="bg-white/60 dark:bg-slate-900/50 rounded-md border border-zinc-100 dark:border-slate-800 p-2 mb-1.5 opacity-60 cursor-grab active:cursor-grabbing" onDoubleClick={(e) => { e.preventDefault(); openEdit(todo); }}>
                                        <div className="flex items-center gap-2">
                                          <button type="button" onClick={() => handleTaskStatusChange(todo, "active")} className="w-4 h-4 rounded bg-green-500 border border-green-500 flex items-center justify-center text-white shrink-0">
                                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                          </button>
                                          <span className="text-sm line-through text-zinc-400 dark:text-slate-500 truncate">{todo.title}</span>
                                        </div>
                                      </div>
                                    </DraggableKanbanCard>
                                  ))}
                                </div>
                              )}
                              {other.length > 0 && (
                                <div className="pt-1">
                                  <p className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-slate-500 font-semibold px-1 mb-1">{t("filter.cancelled" as TranslationKey)}</p>
                                  {other.map((todo) => (
                                    <DraggableKanbanCard key={todo.id} id={todo.id}>
                                      <div className="bg-white/60 dark:bg-slate-900/50 rounded-md border border-zinc-100 dark:border-slate-800 p-2 mb-1.5 opacity-40 cursor-grab active:cursor-grabbing" onDoubleClick={(e) => { e.preventDefault(); openEdit(todo); }}>
                                        <span className="text-sm line-through text-zinc-400 dark:text-slate-500 truncate">{todo.title}</span>
                                      </div>
                                    </DraggableKanbanCard>
                                  ))}
                                </div>
                              )}
                            </DroppablePhaseColumn>
                            {isReal && (
                              <div className="px-2 py-2 border-t border-zinc-200 dark:border-slate-700 shrink-0">
                                <button type="button" onClick={() => { setShowAddTask(true); setAddTaskPhaseId(phase.id); }} className="w-full text-xs text-zinc-400 dark:text-slate-500 hover:text-zinc-600 dark:hover:text-slate-300 hover:bg-zinc-100 dark:hover:bg-slate-700 rounded px-2 py-1.5 transition-colors flex items-center justify-center gap-1">
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                                  {t("projects.addTask" as TranslationKey)}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {orderedPhases.length > 0 && unassigned.length > 0 && (
                        <div className="flex-shrink-0 w-[280px] bg-zinc-50 dark:bg-slate-800/50 rounded-lg border border-zinc-200 dark:border-slate-700 flex flex-col max-h-[calc(100vh-280px)]">
                          <div className="px-3 py-2.5 border-b border-zinc-200 dark:border-slate-700 flex items-center gap-2 shrink-0">
                            <span className="w-3 h-3 rounded-sm shrink-0 bg-zinc-400" />
                            <span className="text-sm font-semibold text-zinc-500 dark:text-slate-400 truncate flex-1">{t("phase.unassigned" as TranslationKey)}</span>
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-zinc-200 dark:bg-slate-700 text-zinc-600 dark:text-slate-400">{unassigned.length}</span>
                          </div>
                          <DroppablePhaseColumn id="__none__">
                            {unassigned.map((todo) => {
                              const dl = deadlineLabel(todo.deadline, t);
                              return (
                                <DraggableKanbanCard key={todo.id} id={todo.id}>
                                  <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-2.5 hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing" onDoubleClick={(e) => { e.preventDefault(); openEdit(todo); }}>
                                    <p className="text-sm font-medium text-zinc-800 dark:text-slate-200">{todo.title}</p>
                                    <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${PRIORITY_BADGES[todo.priority].cls}`}>{t(`priority.${todo.priority}` as TranslationKey)}</span>
                                      {dl && <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${dl.cls}`}>{dl.text}</span>}
                                    </div>
                                  </div>
                                </DraggableKanbanCard>
                              );
                            })}
                          </DroppablePhaseColumn>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
            <DragOverlay>
              {draggedTodo ? (
                <div className="bg-white dark:bg-slate-900 rounded-md border-2 border-blue-400 dark:border-blue-500 p-2.5 shadow-xl w-[260px] rotate-2 opacity-90">
                  <p className="text-sm font-medium text-zinc-800 dark:text-slate-200 truncate">{draggedTodo.title}</p>
                  <div className="flex items-center gap-1 mt-1.5">
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${PRIORITY_BADGES[draggedTodo.priority].cls}`}>{t(`priority.${draggedTodo.priority}` as TranslationKey)}</span>
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-4">
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-slate-300 mb-4">{t("gantt.title" as TranslationKey)}</h3>
            <GanttChart phases={orderedPhases} tasks={projectTodos} t={t} locale={locale} />
          </div>
        )}

        {/* Add Phase */}
        {showAddPhase ? (
          <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-4">
            <h4 className="text-sm font-semibold text-zinc-700 dark:text-slate-300 mb-3">{t("phase.add" as TranslationKey)}</h4>
            <div className="flex flex-col sm:flex-row gap-2">
              <input value={newPhaseName} onChange={(e) => setNewPhaseName(e.target.value)} placeholder={t("phase.namePlaceholder" as TranslationKey)} className="flex-1 rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400" autoFocus />
              <input type="date" value={newPhaseStart} onChange={(e) => setNewPhaseStart(e.target.value)} className="rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100" />
              <input type="date" value={newPhaseEnd} onChange={(e) => setNewPhaseEnd(e.target.value)} className="rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100" />
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={handleAddPhase} disabled={!newPhaseName.trim()} className="rounded bg-slate-700 dark:bg-slate-600 px-4 py-2 text-sm font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-60 transition-colors">{t("projects.save" as TranslationKey)}</button>
              <button onClick={() => { setShowAddPhase(false); setNewPhaseName(""); }} className="rounded border border-zinc-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors">{t("projects.cancel" as TranslationKey)}</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setShowAddPhase(true)} className="w-full rounded-md border-2 border-dashed border-zinc-200 dark:border-slate-700 py-3 text-sm font-medium text-zinc-400 dark:text-slate-500 hover:border-zinc-400 dark:hover:border-slate-500 hover:text-zinc-600 dark:hover:text-slate-300 transition-colors">
            + {t("phase.add" as TranslationKey)}
          </button>
        )}

        {/* Add task modal */}
        {showAddTask && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { setShowAddTask(false); setAddTaskPhaseId(null); }}>
            <div className="bg-white dark:bg-slate-900 rounded-lg shadow-2xl border border-zinc-200 dark:border-slate-700 w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-slate-100 mb-4">{t("projects.addTask" as TranslationKey)}</h3>
              <div className="space-y-3">
                <input value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} placeholder={t("todos.addPlaceholder" as TranslationKey)} className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400" autoFocus />
                <div className="flex gap-3">
                  <select value={newTaskPriority} onChange={(e) => setNewTaskPriority(e.target.value as Priority)} className="flex-1 rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100">
                    <option value="high">{t("priority.high" as TranslationKey)}</option>
                    <option value="medium">{t("priority.medium" as TranslationKey)}</option>
                    <option value="low">{t("priority.low" as TranslationKey)}</option>
                  </select>
                  <select value={newTaskEffort} onChange={(e) => setNewTaskEffort(e.target.value as Effort)} className="flex-1 rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100">
                    <option value="light">{t("effort.light" as TranslationKey)}</option>
                    <option value="medium">{t("effort.medium" as TranslationKey)}</option>
                    <option value="heavy">{t("effort.heavy" as TranslationKey)}</option>
                  </select>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-[10px] font-medium text-zinc-400 dark:text-slate-500 mb-1">{t("projects.startDate" as TranslationKey)}</label>
                    <input type="date" value={newTaskStartDate} onChange={(e) => setNewTaskStartDate(e.target.value)} className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] font-medium text-zinc-400 dark:text-slate-500 mb-1">{t("todos.deadlineLabel" as TranslationKey)}</label>
                    <input type="date" value={newTaskDeadline} min={new Date().toISOString().split("T")[0]} onChange={(e) => setNewTaskDeadline(e.target.value)} className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100" />
                  </div>
                </div>
                {orderedPhases.length > 0 && (
                  <div>
                    <label className="block text-[10px] font-medium text-zinc-400 dark:text-slate-500 mb-1">{t("projects.phases" as TranslationKey)}</label>
                    <select value={addTaskPhaseId ?? ""} onChange={(e) => setAddTaskPhaseId(e.target.value || null)} className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100">
                      <option value="">{t("phase.unassigned" as TranslationKey)}</option>
                      {orderedPhases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => { setShowAddTask(false); setAddTaskPhaseId(null); }} className="rounded border border-zinc-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors">{t("projects.cancel" as TranslationKey)}</button>
                <button onClick={handleAddTask} disabled={!newTaskTitle.trim()} className="rounded bg-slate-700 dark:bg-slate-600 px-4 py-2 text-sm font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-60 transition-colors">{t("projects.save" as TranslationKey)}</button>
              </div>
            </div>
          </div>
        )}

        {/* Link existing task modal */}
        {showLinkTask && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowLinkTask(false)}>
            <div className="bg-white dark:bg-slate-900 rounded-lg shadow-2xl border border-zinc-200 dark:border-slate-700 w-full max-w-md mx-4 p-6 max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-slate-100 mb-4">Link a task</h3>
              <div className="overflow-y-auto flex-1 space-y-1">
                {allTodos.length === 0 ? (
                  <p className="text-sm text-zinc-400 italic text-center py-6">{t("projects.noTasks" as TranslationKey)}</p>
                ) : allTodos.map((todo) => (
                  <button key={todo.id} onClick={() => handleLinkExisting(todo, linkPhaseId)} className="w-full text-left px-3 py-2 rounded hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-between gap-2">
                    <span className="text-sm text-zinc-900 dark:text-slate-100 truncate">{todo.title}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${PRIORITY_BADGES[todo.priority].cls}`}>{t(`priority.${todo.priority}` as TranslationKey)}</span>
                  </button>
                ))}
              </div>
              <div className="flex justify-end mt-4">
                <button onClick={() => setShowLinkTask(false)} className="rounded border border-zinc-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors">{t("projects.cancel" as TranslationKey)}</button>
              </div>
            </div>
          </div>
        )}

        <TaskEditModal
          todo={editingTodo}
          form={editForm}
          onFormChange={(updates) => setEditForm(f => ({ ...f, ...updates }))}
          onSave={saveEdit}
          onClose={() => setEditingTodo(null)}
          saving={editSaving}
          assignEmail={editAssignEmail}
          onAssignEmailChange={handleEditAssignLookup}
          assignedUser={editAssignedUser}
          assignError={editAssignError}
          onAssignLookup={() => {}}
          onClearAssign={() => setEditForm(f => ({ ...f, assignedTo: null }))}
          userDisplayName={displayName}
          onOpenSubtasks={openSubtaskModal}
          subtaskCount={editingTodo ? getSubtasks(editingTodo.id).length : 0}
          effortDefaults={user?.effortMinutes}
          currentUserUid={user?.uid}
        />

        <SubtaskModal
          parent={subtaskParent}
          onClose={() => setSubtaskParent(null)}
          onCreateSubtask={handleCreateSubtask}
          creating={subtaskSubmitting}
          existingSubtasks={subtaskParent ? getSubtasks(subtaskParent.id) : []}
          onCompleteSubtask={(sub) => handleTaskStatusChange(sub, sub.status === "completed" ? "active" : "completed")}
          onDeleteSubtask={(sub) => handleDeleteTask(sub)}
        />

        <ConfirmDialog
          open={!!confirm}
          title={confirm?.title ?? ""}
          message={confirm?.message ?? ""}
          onConfirm={() => confirm?.action()}
          onCancel={() => setConfirm(null)}
          variant="danger"
        />
      </div>
    </AppShell>
  );
}
