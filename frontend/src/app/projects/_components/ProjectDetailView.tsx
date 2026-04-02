"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";

import AppShell from "@/components/AppShell";
import ConfirmDialog from "@/components/ConfirmDialog";
import DeleteTaskDialog from "@/components/DeleteTaskDialog";
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
  reorderTodos as reorderTodosApi,
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

import PageHelpButton from "@/components/PageHelpButton";

import GanttChart from "./GanttChart";
import { DroppablePhaseColumn, DraggableKanbanCard, SortablePhaseContainer, SortableBoardTaskRow } from "./DndWrappers";
import { formatMins, TEMPLATE_PHASES } from "./types";
import type { Project, ProjectPhase, Todo, Priority, Effort, TodoStatus, AuthMeResponse, TranslationKey, DetailTab, Team } from "./types";

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
  loadProjects: () => Promise<unknown>;
  teams: Team[];
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
  teams,
}: ProjectDetailViewProps) {
  const { toast } = useToast();
  const { resolveUser, displayName, cache } = useUserLookup();
  const meUid = user?.uid ?? null;

  useEffect(() => {
    const uids = new Set<string>();
    for (const td of projectTodos) {
      if (td.assignedTo && !cache[td.assignedTo]) uids.add(td.assignedTo);
      if (td.userId && td.userId !== meUid && !cache[td.userId]) uids.add(td.userId);
    }
    uids.forEach((uid) => resolveUser(uid));
  }, [projectTodos, meUid, cache, resolveUser]);

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
  const [newTaskAssignEmail, setNewTaskAssignEmail] = useState("");
  const [newTaskAssignedUser, setNewTaskAssignedUser] = useState<AuthMeResponse | null>(null);
  const [newTaskAssignError, setNewTaskAssignError] = useState<string | null>(null);
  const [showNewTaskSuggestions, setShowNewTaskSuggestions] = useState(false);
  const newTaskAssignRef = useRef<HTMLDivElement>(null);
  const newTaskAssignTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

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
  const [phaseToDelete, setPhaseToDelete] = useState<{ id: string; name: string } | null>(null);
  const [showCreateSub, setShowCreateSub] = useState(false);
  const [subName, setSubName] = useState("");
  const [creatingSub, setCreatingSub] = useState(false);
  const [newTag, setNewTag] = useState("");

  const [draggedTodoId, setDraggedTodoId] = useState<string | null>(null);
  const [boardDraggedId, setBoardDraggedId] = useState<string | null>(null);

  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

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
    for (const [, list] of map) {
      list.sort((a, b) => (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity));
    }
    return map;
  }, [orderedPhases, projectTodos]);

  const subtasksByParent = useMemo(() => {
    const map: Record<string, Todo[]> = {};
    for (const td of projectTodos) {
      if (td.parentId) (map[td.parentId] ??= []).push(td);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity));
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

  const completionStats = useMemo(() => {
    const parents = projectTodos.filter((td) => !td.parentId);
    const total = parents.length;
    const done = parents.filter((td) => td.status !== "active").length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, pct };
  }, [projectTodos]);

  const draggedTodo = useMemo(
    () => (draggedTodoId ? projectTodos.find((t) => t.id === draggedTodoId) ?? null : null),
    [draggedTodoId, projectTodos],
  );

  const boardDraggedTodo = useMemo(
    () => (boardDraggedId ? projectTodos.find((t) => t.id === boardDraggedId) ?? null : null),
    [boardDraggedId, projectTodos],
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
      toast.success(t("toast.taskUpdated"));
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
      toast.success(t("toast.taskUpdated"));
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
    setPhaseToDelete({ id: phaseId, name: phaseName });
  };

  const executeDeletePhase = async (mode: "move" | "delete") => {
    if (!phaseToDelete) return;
    const { id: phaseId } = phaseToDelete;
    setPhaseToDelete(null);
    try {
      const tasksInPhase = projectTodos.filter((td) => td.phaseId === phaseId);
      if (mode === "move") {
        await Promise.all(tasksInPhase.map((task) => updateTodo(task.id, { phaseId: null })));
      } else {
        await Promise.all(tasksInPhase.map((task) => apiDeleteTodo(task.id)));
      }
      await deletePhaseApi(selectedProject.id, phaseId);
      await refreshProject(selectedProject.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
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

  const findPhaseForTask = useCallback((taskId: string): string => {
    for (const [phaseId, tasks] of tasksByPhase) {
      if (tasks.some((t) => t.id === taskId)) return phaseId as string;
    }
    return "__none__";
  }, [tasksByPhase]);

  const handleBoardDragStart = useCallback((event: DragStartEvent) => {
    setBoardDraggedId(String(event.active.id));
  }, []);

  const handleBoardDragEnd = useCallback(async (event: DragEndEvent) => {
    setBoardDraggedId(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const sourcePhase = findPhaseForTask(activeId);

    const allPhaseIds = [...orderedPhases.map((p) => p.id), "__none__"];
    const isOverAPhase = allPhaseIds.includes(overId);
    const targetPhase = isOverAPhase ? overId : findPhaseForTask(overId);

    if (sourcePhase === targetPhase && !isOverAPhase) {
      const phaseTasks = (tasksByPhase.get(sourcePhase) ?? []).filter((td) => !td.parentId);
      const oldIndex = phaseTasks.findIndex((t) => t.id === activeId);
      const newIndex = phaseTasks.findIndex((t) => t.id === overId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

      const reordered = arrayMove(phaseTasks, oldIndex, newIndex);
      setProjectTodos((prev) => {
        const updated = [...prev];
        for (let i = 0; i < reordered.length; i++) {
          const idx = updated.findIndex((t) => t.id === reordered[i].id);
          if (idx !== -1) updated[idx] = { ...updated[idx], sortOrder: i };
        }
        return updated;
      });
      try {
        await reorderTodosApi(reordered.map((t) => t.id));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error");
      }
    } else {
      const newPhaseId = targetPhase === "__none__" ? null : targetPhase;
      const targetTasks = (tasksByPhase.get(targetPhase) ?? []).filter((td) => !td.parentId);
      let insertIndex = targetTasks.length;
      if (!isOverAPhase) {
        const overIndex = targetTasks.findIndex((t) => t.id === overId);
        if (overIndex !== -1) insertIndex = overIndex;
      }

      try {
        const updated = await updateTodo(activeId, { phaseId: newPhaseId, sortOrder: insertIndex });
        setProjectTodos((prev) => prev.map((td) => (td.id === updated.id ? updated : td)));
        const newOrder = [...targetTasks.filter((t) => t.id !== activeId)];
        newOrder.splice(insertIndex, 0, updated);
        await reorderTodosApi(newOrder.map((t) => t.id));
        setProjectTodos((prev) => {
          const result = [...prev];
          for (let i = 0; i < newOrder.length; i++) {
            const idx = result.findIndex((t) => t.id === newOrder[i].id);
            if (idx !== -1) result[idx] = { ...result[idx], sortOrder: i };
          }
          return result;
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error");
      }
    }
  }, [findPhaseForTask, orderedPhases, tasksByPhase, setProjectTodos, toast]);

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
        setEditAssignError(t("assign.userNotFound"));
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

  const projectTeamMembers = useMemo(() => {
    const teamId = selectedProject.teamId;
    if (!teamId) return [];
    const team = teams.find((tm) => tm.id === teamId);
    return team?.members.map((m) => m.email) ?? [];
  }, [selectedProject.teamId, teams]);

  const newTaskAssignSuggestions = useMemo(() => {
    if (projectTeamMembers.length === 0) return [];
    if (!newTaskAssignEmail) return projectTeamMembers;
    const q = newTaskAssignEmail.toLowerCase();
    return projectTeamMembers.filter((e) => e.toLowerCase().includes(q));
  }, [newTaskAssignEmail, projectTeamMembers]);

  const handleNewTaskAssignInput = (email: string) => {
    setNewTaskAssignEmail(email);
    setNewTaskAssignError(null);
    setShowNewTaskSuggestions(true);
    clearTimeout(newTaskAssignTimer.current);
    if (!email.includes("@") || email.length < 5) {
      setNewTaskAssignedUser(null);
      return;
    }
    newTaskAssignTimer.current = setTimeout(async () => {
      try {
        const u = await lookupUser(email);
        if (u) { setNewTaskAssignedUser(u); setNewTaskAssignError(null); }
        else { setNewTaskAssignedUser(null); setNewTaskAssignError(t("assign.userNotFound")); }
      } catch { setNewTaskAssignedUser(null); }
    }, 300);
  };

  const selectNewTaskAssignSuggestion = (email: string) => {
    setNewTaskAssignEmail(email);
    setShowNewTaskSuggestions(false);
    setNewTaskAssignError(null);
    clearTimeout(newTaskAssignTimer.current);
    newTaskAssignTimer.current = setTimeout(async () => {
      try {
        const u = await lookupUser(email);
        if (u) { setNewTaskAssignedUser(u); setNewTaskAssignError(null); }
        else { setNewTaskAssignedUser(null); setNewTaskAssignError(t("assign.userNotFound")); }
      } catch { setNewTaskAssignedUser(null); }
    }, 100);
  };

  useEffect(() => {
    if (!showNewTaskSuggestions) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (newTaskAssignRef.current && !newTaskAssignRef.current.contains(e.target as Node)) {
        setShowNewTaskSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showNewTaskSuggestions]);

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
        assignedTo: newTaskAssignedUser?.uid ?? null,
      });
      setProjectTodos((prev) => [...prev, todo]);
      setNewTaskTitle("");
      setNewTaskPriority("medium");
      setNewTaskEffort("medium");
      setNewTaskStartDate("");
      setNewTaskDeadline("");
      setNewTaskAssignEmail("");
      setNewTaskAssignedUser(null);
      setNewTaskAssignError(null);
      setShowAddTask(false);
      setAddTaskPhaseId(null);
      toast.success(t("toast.taskUpdated"));
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

  const handleAcceptDeclineTask = async (todo: Todo, assignmentStatus: "accepted" | "declined") => {
    try {
      const updated = await updateTodo(todo.id, { assignmentStatus });
      setProjectTodos((prev) => prev.map((td) => (td.id === updated.id ? updated : td)));
      if (editingTodo?.id === todo.id) setEditingTodo(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const [taskToDelete, setTaskToDelete] = useState<Todo | null>(null);

  const handleDeleteTask = (todo: Todo) => {
    setTaskToDelete(todo);
  };

  const executeDeleteTask = async (mode: "promote" | "deleteAll") => {
    if (!taskToDelete) return;
    const todo = taskToDelete;
    setTaskToDelete(null);
    try {
      const subs = getSubtasks(todo.id);
      if (subs.length > 0) {
        if (mode === "promote") {
          await Promise.all(subs.map((s) => updateTodo(s.id, { parentId: null })));
        } else {
          await Promise.all(subs.map((s) => apiDeleteTodo(s.id)));
        }
      }
      await apiDeleteTodo(todo.id);
      await refreshProject(selectedProject.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const handlePromoteSubtask = async (sub: Todo) => {
    try {
      const updated = await updateTodo(sub.id, { parentId: null });
      setProjectTodos((prev) => prev.map((td) => (td.id === updated.id ? updated : td)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const handleReorderSubtasks = async (orderedIds: string[]) => {
    setProjectTodos((prev) => {
      const updated = [...prev];
      orderedIds.forEach((id, idx) => {
        const i = updated.findIndex((td) => td.id === id);
        if (i !== -1) updated[i] = { ...updated[i], sortOrder: idx };
      });
      return updated;
    });
    try {
      await reorderTodosApi(orderedIds);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
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
      toast.success(t("projects.addSubProject"));
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
      title: t("projects.delete"),
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
    if (!teamId) return t("projects.personal");
    return teams.find((tm) => tm.id === teamId)?.name ?? t("projects.personal");
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
          <button type="button" onClick={(e) => { e.stopPropagation(); openSubtaskModal(todo); }} className="text-zinc-400 dark:text-slate-500 hover:text-blue-500 transition-colors shrink-0" title={t("subtask.add")}>
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
          {t(`priority.${todo.priority}`)}
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
            className="text-[10px] rounded border border-zinc-200 dark:border-slate-700 bg-transparent text-zinc-500 dark:text-slate-400 px-1 py-0.5 opacity-100 md:opacity-0 md:group-hover/task:opacity-100 transition-opacity cursor-pointer"
            title={t("phase.moveToPhase")}
            onClick={(e) => e.stopPropagation()}
          >
            <option value="">{t("phase.unassigned")}</option>
            {orderedPhases.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}

        {todo.assignedTo === meUid && todo.userId !== meUid && todo.assignmentStatus !== "accepted" && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button type="button" onClick={(e) => { e.stopPropagation(); handleAcceptDeclineTask(todo, "accepted"); }} title={t("assign.accept")} className="text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors p-0.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            </button>
            {todo.assignmentStatus !== "declined" && (
              <button type="button" onClick={(e) => { e.stopPropagation(); handleAcceptDeclineTask(todo, "declined"); }} title={t("assign.decline")} className="text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors p-0.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        )}
        <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover/task:opacity-100 transition-opacity shrink-0">
          {todo.status === "active" && (
            <button type="button" onClick={(e) => { e.stopPropagation(); handleTaskStatusChange(todo, "cancelled"); }} title={t("filter.cancelled")} className="text-zinc-400 hover:text-amber-600 transition-colors p-0.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
            </button>
          )}
          <button type="button" onClick={(e) => { e.stopPropagation(); handleUnlinkTask(todo); }} title={t("projects.unlinkTask")} className="text-zinc-400 hover:text-orange-500 transition-colors p-0.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.181 8.68a4.503 4.503 0 011.903 6.405m-9.768-2.782L3.56 14.06a4.5 4.5 0 006.364 6.365l.707-.707m6.062-9.192l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-.707.707" /></svg>
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteTask(todo); }} title={t("projects.delete")} className="text-zinc-400 hover:text-red-500 transition-colors p-0.5">
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
          {t("projects.backToList")}
        </button>

        {/* Header */}
        <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-5">
          {editing ? (
            <div className="space-y-3">
              <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400" />
              <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={2} className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400" />
              <div className="flex gap-2">
                <button onClick={handleSaveEdit} className="rounded bg-slate-700 dark:bg-slate-600 px-4 py-2 text-sm font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 transition-colors">{t("settings.save")}</button>
                <button onClick={() => setEditing(false)} className="rounded border border-zinc-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors">{t("projects.cancel")}</button>
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
                    {t(`projects.${selectedProject.status}`)}
                  </span>
                  <span className="text-xs text-zinc-400 dark:text-slate-500">{orderedPhases.length} {t("projects.phases").toLowerCase()} · {projectTodos.filter((td) => !td.parentId).length} {t("projects.tasks")}</span>
                </div>
                {completionStats.total > 0 && (
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 h-2 rounded-full bg-zinc-100 dark:bg-slate-700 overflow-hidden max-w-[200px]">
                      <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${completionStats.pct}%` }} />
                    </div>
                    <span className="text-[10px] font-medium text-zinc-500 dark:text-slate-400">{completionStats.pct}% ({completionStats.done}/{completionStats.total})</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button type="button" onClick={() => setShowAddPhase(true)} className="rounded border border-zinc-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors" title={t("phase.add")}>
                  + {t("projects.phases")}
                </button>
                <button onClick={() => { setEditing(true); setEditName(selectedProject.name); setEditDesc(selectedProject.description); }} className="rounded border border-zinc-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors">
                  {t("projects.edit")}
                </button>
                <button onClick={() => handleArchiveRestore(selectedProject)} className="rounded border border-zinc-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors">
                  {t((selectedProject.status === "active" ? "projects.archive" : "projects.restore"))}
                </button>
                <PageHelpButton
                  title={t("projects.helpTitle")}
                  items={[
                    { icon: "📋", text: t("projects.helpBoard") },
                    { icon: "📊", text: t("projects.helpKanban") },
                    { icon: "📅", text: t("projects.helpGantt") },
                  ]}
                />
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
            <input type="text" placeholder={t("projects.tagPlaceholder")} value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddTag(); } }} className="w-28 rounded-full border border-dashed border-zinc-300 dark:border-slate-600 bg-transparent px-2.5 py-1 text-xs text-zinc-700 dark:text-slate-300 placeholder:text-zinc-400 dark:placeholder:text-slate-500 focus:border-blue-400 dark:focus:border-blue-500 focus:outline-none" />
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
            <span>{t("projects.parentProject")} :</span>
            <button type="button" onClick={() => handleSelectProject(parentProject)} className="text-blue-600 dark:text-blue-400 hover:underline font-medium">{parentProject.name}</button>
          </div>
        )}

        {/* Sub-projects — only root projects (not sub-projects) can have children */}
        {!selectedProject.parentProjectId && (subProjects.length > 0 || selectedProject.status === "active") && (
          <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-zinc-500 dark:text-slate-400 uppercase tracking-wider">{t("projects.subProjects")} ({subProjects.length})</h4>
              {selectedProject.status === "active" && !showCreateSub && (
                <button type="button" onClick={() => setShowCreateSub(true)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium">+ {t("projects.addSubProject")}</button>
              )}
            </div>
            {showCreateSub && (
              <div className="flex gap-2 mb-3">
                <input type="text" placeholder={t("projects.namePlaceholder")} value={subName} onChange={(e) => setSubName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleCreateSubProject(); if (e.key === "Escape") setShowCreateSub(false); }} autoFocus className="flex-1 rounded border border-zinc-300 dark:border-slate-600 px-3 py-1.5 text-sm dark:bg-slate-800 dark:text-slate-100 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400" />
                <button onClick={handleCreateSubProject} disabled={creatingSub || !subName.trim()} className="rounded bg-slate-700 dark:bg-slate-600 px-3 py-1.5 text-xs font-medium text-white dark:text-slate-100 disabled:opacity-40">{t("settings.save")}</button>
                <button onClick={() => { setShowCreateSub(false); setSubName(""); }} className="rounded border border-zinc-300 dark:border-slate-600 px-3 py-1.5 text-xs text-zinc-600 dark:text-slate-300">{t("projects.cancel")}</button>
              </div>
            )}
            {subProjects.length > 0 && (
              <div className="space-y-1">
                {subProjects.map((sub) => (
                  <button key={sub.id} type="button" onClick={() => handleSelectProject(sub)} className="w-full flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors text-left">
                    <span className="font-medium text-zinc-800 dark:text-slate-200">{sub.name}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${sub.status === "active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-zinc-200 text-zinc-600 dark:bg-slate-700 dark:text-slate-400"}`}>{t(`projects.${sub.status}`)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Time allocation summary */}
        {!loadingTodos && projectTodos.length > 0 && (
          <div className="rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
            <h4 className="text-xs font-semibold text-zinc-500 dark:text-slate-400 uppercase tracking-wider mb-3">{t("projects.timeAllocation")}</h4>
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
                  <span className="text-xs text-zinc-600 dark:text-slate-300">{t("projects.unassignedPhase")}</span>
                  <span className="text-xs font-semibold text-zinc-900 dark:text-slate-100">{formatMins(timeByPhase.byPhase.get("__none__")!)}</span>
                </div>
              )}
              <div className="flex items-center gap-2 rounded-md border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 ml-auto">
                <span className="text-xs font-medium text-zinc-500 dark:text-slate-400">{t("projects.totalTime")}</span>
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{formatMins(timeByPhase.total)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex items-center gap-1 bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-1">
          {(["board", "kanban", "gantt"] as DetailTab[]).map((tab) => (
            <button key={tab} onClick={() => setDetailTab(tab)} className={`flex-1 rounded px-4 py-2 text-sm font-medium transition-colors ${detailTab === tab ? "bg-slate-700 dark:bg-slate-600 text-white dark:text-slate-100" : "text-zinc-500 dark:text-slate-400 hover:text-zinc-700 dark:hover:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-800"}`}>
              {t(`projects.${tab}`)}
            </button>
          ))}
        </div>

        {loadingTodos ? (
          <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" /></div>
        ) : detailTab === "board" ? (
          <DndContext sensors={dndSensors} collisionDetection={closestCorners} onDragStart={handleBoardDragStart} onDragEnd={handleBoardDragEnd}>
          <div className="space-y-4">
            {orderedPhases.map((phase) => {
              taskCounter = 0;
              const phaseTasks = tasksByPhase.get(phase.id) ?? [];
              const parentTasks = phaseTasks.filter((td) => !td.parentId);
              const phaseActive = parentTasks.filter((td) => td.status === "active");
              const phaseDone = parentTasks.filter((td) => td.status !== "active");
              const sortedParents = [...phaseActive, ...phaseDone];
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
                        <button onClick={handleSavePhase} className="rounded bg-slate-700 dark:bg-slate-600 px-3 py-1 text-xs font-medium text-white dark:text-slate-100">{t("settings.save")}</button>
                        <button onClick={() => setEditingPhaseId(null)} className="text-xs text-zinc-400 hover:text-zinc-600">{t("projects.cancel")}</button>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold text-zinc-700 dark:text-slate-300">{phase.name}</h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            {phase.startDate && <span className="text-[10px] text-zinc-400 dark:text-slate-500">{phase.startDate}</span>}
                            {phase.startDate && phase.endDate && <span className="text-[10px] text-zinc-300 dark:text-slate-600">→</span>}
                            {phase.endDate && <span className="text-[10px] text-zinc-400 dark:text-slate-500">{phase.endDate}</span>}
                            <span className="text-[10px] text-zinc-400 dark:text-slate-500">({parentTasks.length} {t("phase.tasks")})</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button type="button" onClick={() => { setAddTaskPhaseId(phase.id); setShowAddTask(true); }} className="text-zinc-400 hover:text-blue-500 transition-colors p-1" title={t("projects.addTask")}>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                          </button>
                          <button type="button" onClick={() => openLinkTask(phase.id)} className="text-zinc-400 hover:text-cyan-500 transition-colors p-1" title={t("projects.linkTask")}>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" /><path strokeLinecap="round" strokeLinejoin="round" d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                          </button>
                          <button type="button" onClick={() => { setEditingPhaseId(phase.id); setEditPhaseName(phase.name); setEditPhaseStart(phase.startDate ?? ""); setEditPhaseEnd(phase.endDate ?? ""); }} className="text-zinc-400 hover:text-amber-500 transition-colors p-1" title={t("phase.edit")}>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button type="button" onClick={() => handleDeletePhase(phase.id)} className="text-zinc-400 hover:text-red-500 transition-colors p-1" title={t("phase.delete")}>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="p-3">
                    <SortablePhaseContainer id={phase.id} items={sortedParents.map((t) => t.id)}>
                      {sortedParents.length === 0 ? (
                        <p className="text-xs text-zinc-400 dark:text-slate-500 italic text-center py-4">{t("projects.noTasks")}</p>
                      ) : (
                        sortedParents.map((todo) => {
                          taskCounter++;
                          const parentNum = String(taskCounter);
                          const subs = getSubtasks(todo.id);
                          return (
                            <SortableBoardTaskRow key={todo.id} id={todo.id}>
                              {renderTaskRow(todo, parentNum)}
                              {subs.length > 0 && (
                                <div className="ml-6 pl-3 border-l-2 border-zinc-200 dark:border-slate-700 space-y-1 mt-1 mb-1">
                                  {subs.map((sub, si) => renderTaskRow(sub, `${parentNum}.${si + 1}`))}
                                </div>
                              )}
                            </SortableBoardTaskRow>
                          );
                        })
                      )}
                    </SortablePhaseContainer>
                  </div>
                </div>
              );
            })}

            {(() => {
              taskCounter = 0;
              const unassigned = tasksByPhase.get("__none__") ?? [];
              const parentUnassigned = unassigned.filter((td) => !td.parentId);
              const unActive = parentUnassigned.filter((td) => td.status === "active");
              const unDone = parentUnassigned.filter((td) => td.status !== "active");
              const sortedUnassigned = [...unActive, ...unDone];
              if (sortedUnassigned.length === 0 && orderedPhases.length > 0) return null;
              return (
                <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 overflow-hidden">
                  <div className="px-4 py-3 border-b border-zinc-200 dark:border-slate-700 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-zinc-500 dark:text-slate-400">{t("phase.unassigned")} ({parentUnassigned.length})</h3>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => { setAddTaskPhaseId(null); setShowAddTask(true); }} className="text-zinc-400 hover:text-blue-500 transition-colors p-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                      </button>
                      <button type="button" onClick={() => openLinkTask(null)} className="text-zinc-400 hover:text-cyan-500 transition-colors p-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" /><path strokeLinecap="round" strokeLinejoin="round" d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                      </button>
                    </div>
                  </div>
                  <div className="p-3">
                    <SortablePhaseContainer id="__none__" items={sortedUnassigned.map((t) => t.id)}>
                      {sortedUnassigned.length === 0 ? (
                        <p className="text-xs text-zinc-400 dark:text-slate-500 italic text-center py-4">{t("projects.noTasks")}</p>
                      ) : (
                        sortedUnassigned.map((todo) => {
                          taskCounter++;
                          const parentNum = String(taskCounter);
                          const subs = getSubtasks(todo.id);
                          return (
                            <SortableBoardTaskRow key={todo.id} id={todo.id}>
                              {renderTaskRow(todo, parentNum)}
                              {subs.length > 0 && (
                                <div className="ml-6 pl-3 border-l-2 border-zinc-200 dark:border-slate-700 space-y-1 mt-1 mb-1">
                                  {subs.map((sub, si) => renderTaskRow(sub, `${parentNum}.${si + 1}`))}
                                </div>
                              )}
                            </SortableBoardTaskRow>
                          );
                        })
                      )}
                    </SortablePhaseContainer>
                  </div>
                </div>
              );
            })()}
          </div>
          <DragOverlay>
            {boardDraggedTodo ? (
              <div className="bg-white dark:bg-slate-900 rounded-md border-2 border-blue-400 dark:border-blue-500 p-2.5 shadow-xl rotate-1 opacity-90 max-w-md">
                <p className="text-sm font-medium text-zinc-800 dark:text-slate-200 truncate">{boardDraggedTodo.title}</p>
                <div className="flex items-center gap-1 mt-1">
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${PRIORITY_BADGES[boardDraggedTodo.priority].cls}`}>{t(`priority.${boardDraggedTodo.priority}`)}</span>
                </div>
              </div>
            ) : null}
          </DragOverlay>
          </DndContext>
        ) : detailTab === "kanban" ? (
          <DndContext sensors={dndSensors} onDragStart={handleKanbanDragStart} onDragEnd={handleKanbanDragEnd}>
            <div className="overflow-x-auto pb-4">
              <div className="flex flex-col md:flex-row gap-4 md:min-w-0" style={{ minWidth: typeof window !== "undefined" && window.innerWidth >= 768 ? Math.max(orderedPhases.length + 1, 3) * 290 + "px" : undefined }}>
                {(() => {
                  const kanbanPhases = orderedPhases.length > 0
                    ? orderedPhases
                    : [{ id: "__none__", name: t("phase.unassigned"), color: "#94a3b8", order: 0, projectId: "", startDate: null, endDate: null, createdAt: "" } as ProjectPhase];
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
                          <div key={phase.id} className="flex-shrink-0 w-full md:w-[280px] bg-zinc-50 dark:bg-slate-800/50 rounded-lg border border-zinc-200 dark:border-slate-700 flex flex-col md:max-h-[calc(100vh-280px)]">
                            <div className="px-3 py-2.5 border-b border-zinc-200 dark:border-slate-700 flex items-center gap-2 shrink-0">
                              <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: phase.color }} />
                              <span className="text-sm font-semibold text-zinc-700 dark:text-slate-200 truncate flex-1">{phase.name}</span>
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-zinc-200 dark:bg-slate-700 text-zinc-600 dark:text-slate-400">{phaseTasks.length}</span>
                            </div>
                            <DroppablePhaseColumn id={phase.id}>
                              {active.length === 0 && completed.length === 0 && other.length === 0 && (
                                <p className="text-xs text-zinc-400 dark:text-slate-500 italic text-center py-4">{t("phase.empty")}</p>
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
                                        <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover/card:opacity-100 transition-opacity shrink-0">
                                          <button type="button" onClick={(e) => { e.stopPropagation(); openSubtaskModal(todo); }} className="text-zinc-400 hover:text-blue-500 transition-colors p-0.5" title={t("subtask.add")}>
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                          </button>
                                          <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteTask(todo); }} className="text-zinc-400 hover:text-red-500 transition-colors p-0.5">
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                          </button>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1 mt-2 flex-wrap">
                                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${PRIORITY_BADGES[todo.priority].cls}`}>{t(`priority.${todo.priority}`)}</span>
                                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${EFFORT_BADGES[todo.effort ?? "medium"].cls}`}>{t(EFFORT_BADGES[todo.effort ?? "medium"].tKey)}</span>
                                        {dl && <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${dl.cls}`}>{dl.text}</span>}
                                        {subs.length > 0 && <span className="text-[9px] font-medium text-blue-500 bg-blue-50 dark:bg-blue-950/40 px-1 py-0.5 rounded">{subs.length} ↳</span>}
                                        {todo.assignedTo && todo.assignedTo !== meUid && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 truncate max-w-[100px]">← {displayName(todo.userId)}</span>}
                                        {todo.assignedTo && todo.assignedTo !== todo.userId && todo.userId === meUid && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300 truncate max-w-[100px]">→ {displayName(todo.assignedTo)}</span>}
                                        {todo.assignmentStatus && todo.assignedTo && (
                                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                                            todo.assignmentStatus === "accepted" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                                              : todo.assignmentStatus === "declined" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                                                : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                                          }`}>{todo.assignmentStatus === "accepted" ? t("assign.statusAccepted") : todo.assignmentStatus === "declined" ? t("assign.statusDeclined") : t("assign.statusPending")}</span>
                                        )}
                                      </div>
                                      {todo.assignedTo === meUid && todo.userId !== meUid && todo.assignmentStatus !== "accepted" && (
                                        <div className="flex items-center gap-1 mt-1.5">
                                          <button type="button" onClick={(e) => { e.stopPropagation(); handleAcceptDeclineTask(todo, "accepted"); }} className="flex-1 rounded border border-emerald-300 dark:border-emerald-700 px-2 py-1 text-[9px] font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors">
                                            {t("assign.accept")}
                                          </button>
                                          {todo.assignmentStatus !== "declined" && (
                                            <button type="button" onClick={(e) => { e.stopPropagation(); handleAcceptDeclineTask(todo, "declined"); }} className="flex-1 rounded border border-red-300 dark:border-red-700 px-2 py-1 text-[9px] font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors">
                                              {t("assign.decline")}
                                            </button>
                                          )}
                                        </div>
                                      )}
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
                                  <p className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-slate-500 font-semibold px-1 mb-1">{t("filter.completed")}</p>
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
                                  <p className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-slate-500 font-semibold px-1 mb-1">{t("filter.cancelled")}</p>
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
                                  {t("projects.addTask")}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {orderedPhases.length > 0 && unassigned.length > 0 && (
                        <div className="flex-shrink-0 w-full md:w-[280px] bg-zinc-50 dark:bg-slate-800/50 rounded-lg border border-zinc-200 dark:border-slate-700 flex flex-col md:max-h-[calc(100vh-280px)]">
                          <div className="px-3 py-2.5 border-b border-zinc-200 dark:border-slate-700 flex items-center gap-2 shrink-0">
                            <span className="w-3 h-3 rounded-sm shrink-0 bg-zinc-400" />
                            <span className="text-sm font-semibold text-zinc-500 dark:text-slate-400 truncate flex-1">{t("phase.unassigned")}</span>
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
                                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${PRIORITY_BADGES[todo.priority].cls}`}>{t(`priority.${todo.priority}`)}</span>
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
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${PRIORITY_BADGES[draggedTodo.priority].cls}`}>{t(`priority.${draggedTodo.priority}`)}</span>
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-4">
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-slate-300 mb-4">{t("gantt.title")}</h3>
            <GanttChart
              phases={orderedPhases}
              tasks={projectTodos}
              t={t}
              locale={locale}
              onMoveTask={async (taskId, newPhaseId, newIndex) => {
                try {
                  const updated = await updateTodo(taskId, { phaseId: newPhaseId, sortOrder: newIndex });
                  setProjectTodos((prev) => prev.map((td) => (td.id === updated.id ? updated : td)));
                  const targetPhaseKey = newPhaseId ?? "__none__";
                  const targetTasks = (tasksByPhase.get(targetPhaseKey) ?? []).filter((td) => !td.parentId && td.id !== taskId);
                  targetTasks.splice(newIndex, 0, updated);
                  await reorderTodosApi(targetTasks.map((t2) => t2.id));
                  setProjectTodos((prev) => {
                    const result = [...prev];
                    for (let i = 0; i < targetTasks.length; i++) {
                      const idx = result.findIndex((t2) => t2.id === targetTasks[i].id);
                      if (idx !== -1) result[idx] = { ...result[idx], sortOrder: i };
                    }
                    return result;
                  });
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Error");
                }
              }}
            />
          </div>
        )}

        {/* Add Phase */}
        {showAddPhase ? (
          <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-4">
            <h4 className="text-sm font-semibold text-zinc-700 dark:text-slate-300 mb-3">{t("phase.add")}</h4>
            <div className="flex flex-col sm:flex-row gap-2">
              <input value={newPhaseName} onChange={(e) => setNewPhaseName(e.target.value)} placeholder={t("phase.namePlaceholder")} className="flex-1 rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400" autoFocus />
              <input type="date" value={newPhaseStart} onChange={(e) => setNewPhaseStart(e.target.value)} className="rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100" />
              <input type="date" value={newPhaseEnd} onChange={(e) => setNewPhaseEnd(e.target.value)} className="rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100" />
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={handleAddPhase} disabled={!newPhaseName.trim()} className="rounded bg-slate-700 dark:bg-slate-600 px-4 py-2 text-sm font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-60 transition-colors">{t("projects.save")}</button>
              <button onClick={() => { setShowAddPhase(false); setNewPhaseName(""); }} className="rounded border border-zinc-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors">{t("projects.cancel")}</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setShowAddPhase(true)} className="w-full rounded-md border-2 border-dashed border-zinc-200 dark:border-slate-700 py-3 text-sm font-medium text-zinc-400 dark:text-slate-500 hover:border-zinc-400 dark:hover:border-slate-500 hover:text-zinc-600 dark:hover:text-slate-300 transition-colors">
            + {t("phase.add")}
          </button>
        )}

        {/* Add task modal */}
        {showAddTask && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { setShowAddTask(false); setAddTaskPhaseId(null); }}>
            <div className="bg-white dark:bg-slate-900 rounded-lg shadow-2xl border border-zinc-200 dark:border-slate-700 w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-slate-100 mb-4">{t("projects.addTask")}</h3>
              <div className="space-y-3">
                <input value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} placeholder={t("todos.addPlaceholder")} className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400" autoFocus />
                <div className="flex gap-3">
                  <select value={newTaskPriority} onChange={(e) => setNewTaskPriority(e.target.value as Priority)} className="flex-1 rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100">
                    <option value="high">{t("priority.high")}</option>
                    <option value="medium">{t("priority.medium")}</option>
                    <option value="low">{t("priority.low")}</option>
                  </select>
                  <select value={newTaskEffort} onChange={(e) => setNewTaskEffort(e.target.value as Effort)} className="flex-1 rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100">
                    <option value="light">{t("effort.light")}</option>
                    <option value="medium">{t("effort.medium")}</option>
                    <option value="heavy">{t("effort.heavy")}</option>
                  </select>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-[10px] font-medium text-zinc-400 dark:text-slate-500 mb-1">{t("projects.startDate")}</label>
                    <input type="date" value={newTaskStartDate} onChange={(e) => setNewTaskStartDate(e.target.value)} className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] font-medium text-zinc-400 dark:text-slate-500 mb-1">{t("todos.deadlineLabel")}</label>
                    <input type="date" value={newTaskDeadline} onChange={(e) => setNewTaskDeadline(e.target.value)} className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100" />
                  </div>
                </div>
                {orderedPhases.length > 0 && (
                  <div>
                    <label className="block text-[10px] font-medium text-zinc-400 dark:text-slate-500 mb-1">{t("projects.phases")}</label>
                    <select value={addTaskPhaseId ?? ""} onChange={(e) => setAddTaskPhaseId(e.target.value || null)} className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100">
                      <option value="">{t("phase.unassigned")}</option>
                      {orderedPhases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                )}
                {projectTeamMembers.length > 0 && (
                  <div>
                    <label className="block text-[10px] font-medium text-zinc-400 dark:text-slate-500 mb-1">{t("assign.label")}</label>
                    <div ref={newTaskAssignRef} className="relative">
                      <input
                        type="email"
                        placeholder={t("assign.placeholder")}
                        value={newTaskAssignEmail}
                        onChange={(e) => handleNewTaskAssignInput(e.target.value)}
                        onFocus={() => setShowNewTaskSuggestions(true)}
                        autoComplete="off"
                        className={`w-full rounded border px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 ${
                          newTaskAssignedUser
                            ? "border-green-400 dark:border-green-600 focus:border-green-500 focus:ring-green-500"
                            : newTaskAssignError
                              ? "border-red-400 dark:border-red-600 focus:border-red-500 focus:ring-red-500"
                              : "border-zinc-300 dark:border-slate-600 focus:border-slate-700 dark:focus:border-slate-400 focus:ring-slate-700 dark:focus:ring-slate-400"
                        }`}
                      />
                      {newTaskAssignedUser && (
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-green-500">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                      )}
                      {showNewTaskSuggestions && newTaskAssignSuggestions.length > 0 && !newTaskAssignedUser && (
                        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white dark:bg-slate-800 border border-zinc-200 dark:border-slate-600 rounded shadow-lg py-1 max-h-40 overflow-y-auto">
                          {newTaskAssignSuggestions.slice(0, 8).map((email) => (
                            <button
                              key={email}
                              type="button"
                              onClick={() => selectNewTaskAssignSuggestion(email)}
                              className="block w-full text-left px-3 py-1.5 text-sm text-zinc-700 dark:text-slate-200 hover:bg-zinc-100 dark:hover:bg-slate-700 transition-colors truncate"
                            >
                              {email}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {newTaskAssignError && (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">{newTaskAssignError}</p>
                    )}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => { setShowAddTask(false); setAddTaskPhaseId(null); }} className="rounded border border-zinc-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors">{t("projects.cancel")}</button>
                <button onClick={handleAddTask} disabled={!newTaskTitle.trim()} className="rounded bg-slate-700 dark:bg-slate-600 px-4 py-2 text-sm font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-60 transition-colors">{t("projects.save")}</button>
              </div>
            </div>
          </div>
        )}

        {/* Link existing task modal */}
        {showLinkTask && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowLinkTask(false)}>
            <div className="bg-white dark:bg-slate-900 rounded-lg shadow-2xl border border-zinc-200 dark:border-slate-700 w-full max-w-md mx-4 p-6 max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-slate-100 mb-4">{t("projects.linkTask")}</h3>
              <div className="overflow-y-auto flex-1 space-y-1">
                {allTodos.length === 0 ? (
                  <p className="text-sm text-zinc-400 italic text-center py-6">{t("projects.noTasksToLink")}</p>
                ) : allTodos.map((todo) => (
                  <button key={todo.id} onClick={() => handleLinkExisting(todo, linkPhaseId)} className="w-full text-left px-3 py-2 rounded hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-between gap-2">
                    <span className="text-sm text-zinc-900 dark:text-slate-100 truncate">{todo.title}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${PRIORITY_BADGES[todo.priority].cls}`}>{t(`priority.${todo.priority}`)}</span>
                  </button>
                ))}
              </div>
              <div className="flex justify-end mt-4">
                <button onClick={() => setShowLinkTask(false)} className="rounded border border-zinc-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors">{t("projects.cancel")}</button>
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
          memberSuggestions={projectTeamMembers}
          isTaskOwner={!editingTodo || editingTodo.userId === meUid}
          onAcceptDecline={editingTodo ? (status) => handleAcceptDeclineTask(editingTodo, status) : undefined}
          onSuggestedSlotChange={editingTodo && editingTodo.userId === meUid && editingTodo.assignedTo ? async (slot) => {
            try {
              const updated = await updateTodo(editingTodo.id, { suggestedSlot: slot });
              setProjectTodos((prev) => prev.map((td) => td.id === updated.id ? updated : td));
              setEditingTodo(updated);
              toast.success(slot ? t("schedule.suggestSlot") : t("schedule.clearSuggestion"));
            } catch { /* handled by API layer */ }
          } : undefined}
        />

        <SubtaskModal
          parent={subtaskParent}
          onClose={() => setSubtaskParent(null)}
          onCreateSubtask={handleCreateSubtask}
          creating={subtaskSubmitting}
          existingSubtasks={subtaskParent ? getSubtasks(subtaskParent.id) : []}
          onCompleteSubtask={(sub) => handleTaskStatusChange(sub, sub.status === "completed" ? "active" : "completed")}
          onDeleteSubtask={(sub) => handleDeleteTask(sub)}
          onPromoteSubtask={handlePromoteSubtask}
          onReorderSubtasks={handleReorderSubtasks}
        />

        <ConfirmDialog
          open={!!confirm}
          title={confirm?.title ?? ""}
          message={confirm?.message ?? ""}
          onConfirm={() => confirm?.action()}
          onCancel={() => setConfirm(null)}
          variant="danger"
        />

        {phaseToDelete && (() => {
          const tasksCount = projectTodos.filter((td) => td.phaseId === phaseToDelete.id).length;
          return (
            <div className="fixed inset-0 z-[9998] flex items-center justify-center">
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setPhaseToDelete(null)} />
              <div
                role="dialog"
                aria-modal="true"
                className="relative bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
              >
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-slate-100">
                  {t("phase.delete")}
                </h2>
                <p className="mt-1 text-sm font-medium text-zinc-700 dark:text-slate-300">
                  {phaseToDelete.name}
                </p>
                <p className="mt-2 text-sm text-zinc-600 dark:text-slate-400">
                  {tasksCount > 0
                    ? t("phase.deleteConfirmMessage")
                    : t("phase.deleteNoTasks")}
                </p>
                <div className={`mt-6 grid gap-3 ${tasksCount > 0 ? "grid-cols-3" : "grid-cols-2"}`}>
                  <button
                    type="button"
                    onClick={() => setPhaseToDelete(null)}
                    className="px-4 py-2 text-sm rounded-md border border-zinc-300 dark:border-slate-600
                      text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-700 transition-colors text-center"
                  >
                    {t("cancel")}
                  </button>
                  {tasksCount > 0 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => executeDeletePhase("move")}
                        className="px-4 py-2 text-sm rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors
                          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 text-center"
                      >
                        {t("phase.deleteMoveTasks")}
                      </button>
                      <button
                        type="button"
                        onClick={() => executeDeletePhase("delete")}
                        className="px-4 py-2 text-sm rounded-md text-white bg-red-600 hover:bg-red-700 transition-colors
                          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 text-center"
                      >
                        {t("phase.deleteDeleteTasks")}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => executeDeletePhase("move")}
                      className="px-4 py-2 text-sm rounded-md text-white bg-red-600 hover:bg-red-700 transition-colors
                        focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 text-center"
                    >
                      {t("phase.delete")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        <DeleteTaskDialog
          open={!!taskToDelete}
          taskTitle={taskToDelete?.title ?? ""}
          subtaskCount={taskToDelete ? getSubtasks(taskToDelete.id).length : 0}
          onCancel={() => setTaskToDelete(null)}
          onDeleteAndPromote={() => executeDeleteTask("promote")}
          onDeleteAll={() => executeDeleteTask("deleteAll")}
        />
      </div>
    </AppShell>
  );
}
