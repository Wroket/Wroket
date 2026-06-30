import { ValidationError } from "../utils/errors";
import { getTeam, getTeamRole } from "./teamService";
import {
  getProjectById,
  listActiveProjectIdsForTeam,
  type Project,
} from "./projectService";
import { listProjectTodos } from "./todoService";
import { computeProjectSteeringSnapshot, type ProjectSteeringSnapshot } from "./projectSteeringService";

export interface TeamPortfolioProjectRow {
  projectId: string;
  projectName: string;
  teamId: string | null;
  health: ProjectSteeringSnapshot["health"];
  completionRatio: number | null;
  activeCount: number;
  overdueCount: number;
  atRiskCount: number;
  nextMilestone: { phaseName: string; endDate: string; daysLeft: number } | null;
}

export interface TeamPortfolioSnapshot {
  teamId: string;
  generatedAt: string;
  projects: TeamPortfolioProjectRow[];
}

export async function buildTeamPortfolio(teamId: string, uid: string, userEmail: string): Promise<TeamPortfolioSnapshot> {
  const team = getTeam(teamId);
  if (!team) throw new ValidationError("Équipe introuvable");
  const role = getTeamRole(team, uid, userEmail);
  if (!role) throw new ValidationError("Vous ne faites pas partie de cette équipe");

  const projectIds = listActiveProjectIdsForTeam(teamId);
  const now = new Date();
  const projects: TeamPortfolioProjectRow[] = [];

  for (const projectId of projectIds) {
    const project = getProjectById(projectId);
    if (!project || project.status !== "active" || project.parentProjectId) continue;

    const todos = await listProjectTodos(project.id);
    const snap = computeProjectSteeringSnapshot(project, todos);
    const next = snap.upcomingMilestones[0] ?? null;

    projects.push({
      projectId: project.id,
      projectName: project.name,
      teamId: project.teamId,
      health: snap.health,
      completionRatio: snap.completionRatio,
      activeCount: snap.activeCount,
      overdueCount: snap.overdueCount,
      atRiskCount: snap.atRiskCount,
      nextMilestone: next
        ? { phaseName: next.label, endDate: next.endDate, daysLeft: next.daysLeft }
        : null,
    });
  }

  projects.sort((a, b) => {
    const rank = (h: TeamPortfolioProjectRow["health"]) => {
      if (h === "overdue") return 0;
      if (h === "at-risk") return 1;
      if (h === "on-track") return 2;
      if (h === "done") return 3;
      return 4;
    };
    const d = rank(a.health) - rank(b.health);
    if (d !== 0) return d;
    return a.projectName.localeCompare(b.projectName);
  });

  return {
    teamId,
    generatedAt: now.toISOString(),
    projects,
  };
}
