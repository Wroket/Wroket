import { getEffectiveDueDay, isEffectivelyOverdue } from "./effectiveDue";
import type { Project, ProjectPhase, Todo } from "./api";
import type { ProjectHealth } from "@/app/projects/_components/types";

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

function computeHealth(active: Todo[], now: Date): ProjectHealth {
  if (active.length === 0) return "empty";
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
  if (active.some((td) => isEffectivelyOverdue(td, now))) return "overdue";
  if (
    active.some(
      (td) =>
        td.priority === "high" ||
        (() => {
          const due = getEffectiveDueDay(td);
          return due && due.getTime() - now.getTime() < threeDaysMs;
        })(),
    )
  ) {
    return "at-risk";
  }
  return "on-track";
}

export function computeProjectSteering(
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
    active.length === 0 && completed.length > 0
      ? "done"
      : computeHealth(active, now);

  const phases: PhaseSteeringRow[] = (project.phases ?? []).map((phase: ProjectPhase) => {
    const phaseTodos = rootTodos.filter((t) => t.phaseId === phase.id);
    const phaseActive = phaseTodos.filter((t) => t.status === "active");
    const phaseOverdue = phaseActive.filter((t) => isEffectivelyOverdue(t, now));
    return {
      phaseId: phase.id,
      phaseName: phase.name,
      endDate: phase.endDate ?? null,
      activeCount: phaseActive.length,
      overdueCount: phaseOverdue.length,
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
      return {
        phaseId: p.id,
        phaseName: p.name,
        endDate: p.endDate!,
        daysLeft,
      };
    })
    .filter((m) => m.daysLeft >= -7)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 5);

  const topOverdue: OverdueTaskRow[] = overdueActive
    .sort((a, b) => {
      const da = getEffectiveDueDay(a)?.getTime() ?? 0;
      const db = getEffectiveDueDay(b)?.getTime() ?? 0;
      return da - db;
    })
    .slice(0, 8)
    .map((t) => ({
      id: t.id,
      title: t.title,
      phaseName: t.phaseId ? phaseMap.get(t.phaseId)?.name ?? "" : "",
      deadline: t.deadline,
      priority: t.priority,
    }));

  const relevant = active.length + completed.length;
  const completionRatio = relevant > 0 ? Math.round((completed.length / relevant) * 100) : null;

  return {
    health,
    activeCount: active.length,
    completedCount: completed.length,
    overdueCount: overdueActive.length,
    atRiskCount: atRiskActive.length,
    noDeadlineCount: noDeadlineActive.length,
    completionRatio,
    phases,
    upcomingMilestones,
    topOverdue,
    generatedAt: now.toISOString(),
  };
}

export function steeringSnapshotToCsv(projectName: string, snap: ProjectSteeringSnapshot): string {
  const lines: string[] = [
    "Section,Clé,Valeur",
    `Projet,Nom,${csvEscape(projectName)}`,
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
        `${csvEscape(p.phaseName || "Sans phase")},${p.endDate ?? ""},${p.activeCount},${p.overdueCount},${p.completedCount},${p.health}`,
    ),
    "",
    "Tâche en retard,Titre,Phase,Échéance,Priorité",
    ...snap.topOverdue.map(
      (t) => `${t.id},${csvEscape(t.title)},${csvEscape(t.phaseName)},${t.deadline ?? ""},${t.priority}`,
    ),
  ];
  return lines.join("\n");
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
