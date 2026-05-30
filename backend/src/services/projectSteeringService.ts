import type { Project, ProjectPhase } from "./projectService";
import type { Todo } from "./todoService";

export type ProjectHealth = "done" | "overdue" | "at-risk" | "on-track" | "empty";

export interface PhaseSteeringRow {
  phaseId: string;
  phaseName: string;
  endDate: string | null;
  activeCount: number;
  overdueCount: number;
  completedCount: number;
  health: ProjectHealth;
}

export interface OverdueTaskRow {
  id: string;
  title: string;
  phaseName: string;
  deadline: string | null;
  priority: string;
}

export interface UpcomingMilestone {
  phaseId: string;
  phaseName: string;
  endDate: string;
  daysLeft: number;
}

export interface ProjectSteeringSnapshot {
  health: ProjectHealth;
  activeCount: number;
  completedCount: number;
  overdueCount: number;
  atRiskCount: number;
  noDeadlineCount: number;
  completionRatio: number | null;
  phases: PhaseSteeringRow[];
  upcomingMilestones: UpcomingMilestone[];
  topOverdue: OverdueTaskRow[];
  generatedAt: string;
}

function parseDeadlineDay(deadline: string): Date {
  const d = new Date(deadline);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getEffectiveDueDay(todo: Todo): Date | null {
  const days: Date[] = [];
  if (todo.deadline?.trim()) {
    const d = parseDeadlineDay(todo.deadline.trim());
    if (!Number.isNaN(d.getTime())) days.push(d);
  }
  if (todo.scheduledSlot?.start) {
    const d = new Date(todo.scheduledSlot.start);
    if (!Number.isNaN(d.getTime())) {
      d.setHours(0, 0, 0, 0);
      days.push(d);
    }
  }
  if (days.length === 0) return null;
  return days.reduce((a, b) => (a.getTime() <= b.getTime() ? a : b));
}

function isEffectivelyOverdue(todo: Todo, now: Date): boolean {
  const due = getEffectiveDueDay(todo);
  if (!due) return false;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return due.getTime() < today.getTime();
}

function computeHealth(active: Todo[], now: Date): ProjectHealth {
  if (active.length === 0) return "empty";
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
  if (active.some((td) => isEffectivelyOverdue(td, now))) return "overdue";
  if (
    active.some((td) => {
      if (td.priority === "high") return true;
      const due = getEffectiveDueDay(td);
      return !!due && due.getTime() - now.getTime() < threeDaysMs;
    })
  ) {
    return "at-risk";
  }
  return "on-track";
}

export function computeProjectSteeringSnapshot(
  project: Project,
  todos: Todo[],
  now: Date = new Date(),
): ProjectSteeringSnapshot {
  const rootTodos = todos.filter((t) => !t.parentId);
  const active = rootTodos.filter((t) => t.status === "active");
  const completed = rootTodos.filter((t) => t.status === "completed");
  const phaseMap = new Map((project.phases ?? []).map((p) => [p.id, p]));

  const overdueActive = active.filter((t) => isEffectivelyOverdue(t, now));
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
  const atRiskActive = active.filter((t) => {
    if (isEffectivelyOverdue(t, now)) return false;
    if (t.priority === "high") return true;
    const due = getEffectiveDueDay(t);
    return !!due && due.getTime() - now.getTime() < threeDaysMs;
  });
  const noDeadlineActive = active.filter((t) => !getEffectiveDueDay(t));

  const health =
    active.length === 0 && completed.length > 0 ? "done" : computeHealth(active, now);

  const phases: PhaseSteeringRow[] = (project.phases ?? []).map((phase: ProjectPhase) => {
    const phaseTodos = rootTodos.filter((t) => t.phaseId === phase.id);
    const phaseActive = phaseTodos.filter((t) => t.status === "active");
    return {
      phaseId: phase.id,
      phaseName: phase.name,
      endDate: phase.endDate ?? null,
      activeCount: phaseActive.length,
      overdueCount: phaseActive.filter((t) => isEffectivelyOverdue(t, now)).length,
      completedCount: phaseTodos.filter((t) => t.status === "completed").length,
      health: computeHealth(phaseActive, now),
    };
  });

  const unphasedActive = active.filter((t) => !t.phaseId);
  if (unphasedActive.length > 0) {
    phases.push({
      phaseId: "__none__",
      phaseName: "",
      endDate: null,
      activeCount: unphasedActive.length,
      overdueCount: unphasedActive.filter((t) => isEffectivelyOverdue(t, now)).length,
      completedCount: rootTodos.filter((t) => !t.phaseId && t.status === "completed").length,
      health: computeHealth(unphasedActive, now),
    });
  }

  const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const upcomingMilestones: UpcomingMilestone[] = (project.phases ?? [])
    .filter((p) => p.endDate?.trim())
    .map((p) => {
      const end = new Date(p.endDate! + "T23:59:59");
      const daysLeft = Math.ceil((end.getTime() - todayMs) / (24 * 60 * 60 * 1000));
      return { phaseId: p.id, phaseName: p.name, endDate: p.endDate!, daysLeft };
    })
    .filter((m) => m.daysLeft >= -7)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 5);

  const topOverdue: OverdueTaskRow[] = overdueActive
    .sort((a, b) => (getEffectiveDueDay(a)?.getTime() ?? 0) - (getEffectiveDueDay(b)?.getTime() ?? 0))
    .slice(0, 8)
    .map((t) => ({
      id: t.id,
      title: t.title,
      phaseName: t.phaseId ? phaseMap.get(t.phaseId)?.name ?? "" : "",
      deadline: t.deadline,
      priority: t.priority,
    }));

  const relevant = active.length + completed.length;
  return {
    health,
    activeCount: active.length,
    completedCount: completed.length,
    overdueCount: overdueActive.length,
    atRiskCount: atRiskActive.length,
    noDeadlineCount: noDeadlineActive.length,
    completionRatio: relevant > 0 ? Math.round((completed.length / relevant) * 100) : null,
    phases,
    upcomingMilestones,
    topOverdue,
    generatedAt: now.toISOString(),
  };
}

export function steeringSnapshotToCsv(projectName: string, snap: ProjectSteeringSnapshot): string {
  const esc = (v: string) => (v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v);
  return [
    "Section,Clé,Valeur",
    `Projet,Nom,${esc(projectName)}`,
    `Projet,Santé,${snap.health}`,
    `KPI,Tâches actives,${snap.activeCount}`,
    `KPI,Complétées,${snap.completedCount}`,
    `KPI,En retard,${snap.overdueCount}`,
    `KPI,À risque,${snap.atRiskCount}`,
    `KPI,Sans échéance,${snap.noDeadlineCount}`,
    `KPI,Avancement %,${snap.completionRatio ?? ""}`,
    "",
    "Phase,Fin,Actives,En retard,Complétées,Santé",
    ...snap.phases.map(
      (p) =>
        `${esc(p.phaseName || "Sans phase")},${p.endDate ?? ""},${p.activeCount},${p.overdueCount},${p.completedCount},${p.health}`,
    ),
    "",
    "Tâche en retard,Titre,Phase,Échéance,Priorité",
    ...snap.topOverdue.map(
      (t) => `${t.id},${esc(t.title)},${esc(t.phaseName)},${t.deadline ?? ""},${t.priority}`,
    ),
  ].join("\n");
}
