import type { ProjectMilestone, ProjectPhase, Todo } from "@/lib/api";
import type { SharedProjectTaskRow, SharedProjectView } from "@/lib/api/projectShare";

const SHARED_PROJECT_ID = "__shared__";

export function sharedPhasesToProjectPhases(view: SharedProjectView): ProjectPhase[] {
  return view.phases.map((p) => ({
    id: p.id,
    projectId: SHARED_PROJECT_ID,
    name: p.name,
    color: p.color,
    order: p.order,
    startDate: p.startDate,
    endDate: p.endDate,
    createdAt: "",
  }));
}

export function sharedMilestonesToProjectMilestones(view: SharedProjectView): ProjectMilestone[] {
  return (view.milestones ?? []).map((m) => ({
    id: m.id,
    projectId: SHARED_PROJECT_ID,
    title: m.title,
    date: m.date,
    phaseId: m.phaseId,
    color: m.color,
    order: m.order,
    createdAt: "",
  }));
}

export function sharedTasksToTodos(tasks: SharedProjectTaskRow[]): Todo[] {
  return tasks.map((t) => ({
    id: t.id,
    userId: "",
    title: t.title,
    status: t.status as Todo["status"],
    priority: t.priority as Todo["priority"],
    effort: (t.effort ?? "medium") as Todo["effort"],
    phaseId: t.phaseId,
    startDate: t.startDate,
    deadline: t.deadline,
    sortOrder: t.sortOrder,
    projectId: SHARED_PROJECT_ID,
    parentId: null,
    assignedTo: null,
    assignmentStatus: null,
    estimatedMinutes: null,
    tags: [],
    blockedByTodoIds: t.blockedByTodoIds ?? [],
    recurrence: null,
    scheduledSlot: null,
    suggestedSlot: null,
    statusChangedAt: "",
    createdAt: "",
    updatedAt: "",
  }));
}
