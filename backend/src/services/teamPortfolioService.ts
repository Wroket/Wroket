import { ForbiddenError, ValidationError } from "../utils/errors";
import { getTeam, getTeamRole } from "./teamService";
import {
  getProjectById,
  listActiveProjectIdsForTeam,
  listProjects,
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
  /** Team id, or `"personal"` for owner personal projects. */
  teamId: string;
  generatedAt: string;
  projects: TeamPortfolioProjectRow[];
}

function healthRank(h: TeamPortfolioProjectRow["health"]): number {
  if (h === "overdue") return 0;
  if (h === "at-risk") return 1;
  if (h === "undated") return 2;
  if (h === "on-track") return 3;
  if (h === "done") return 4;
  return 5;
}

function sortPortfolioRows(projects: TeamPortfolioProjectRow[]): void {
  projects.sort((a, b) => {
    const d = healthRank(a.health) - healthRank(b.health);
    if (d !== 0) return d;
    return a.projectName.localeCompare(b.projectName);
  });
}

/**
 * Build one portfolio row from project + todos (steering snapshot).
 */
async function toPortfolioRow(project: Project): Promise<TeamPortfolioProjectRow> {
  const todos = await listProjectTodos(project.id);
  const snap = computeProjectSteeringSnapshot(project, todos);
  const next = snap.upcomingMilestones[0] ?? null;
  return {
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
  };
}

export async function buildTeamPortfolio(teamId: string, uid: string, userEmail: string): Promise<TeamPortfolioSnapshot> {
  const team = getTeam(teamId);
  if (!team) throw new ValidationError("Équipe introuvable");
  const role = getTeamRole(team, uid, userEmail);
  if (!role) throw new ValidationError("Vous ne faites pas partie de cette équipe");
  if (role === "workspace-admin") {
    throw new ForbiddenError(
      "Le portfolio projet n'est pas accessible aux administrateurs workspace.",
      "WORKSPACE_ADMIN_PRODUCT_DENIED",
    );
  }

  const projectIds = listActiveProjectIdsForTeam(teamId);
  const now = new Date();
  const projects: TeamPortfolioProjectRow[] = [];

  for (const projectId of projectIds) {
    const project = getProjectById(projectId);
    if (!project || project.status !== "active" || project.parentProjectId) continue;
    projects.push(await toPortfolioRow(project));
  }

  sortPortfolioRows(projects);

  return {
    teamId,
    generatedAt: now.toISOString(),
    projects,
  };
}

/**
 * Portfolio of the caller's personal (non-team) root active projects.
 */
export async function buildPersonalPortfolio(uid: string, userEmail: string): Promise<TeamPortfolioSnapshot> {
  const now = new Date();
  const projects: TeamPortfolioProjectRow[] = [];

  for (const project of listProjects(uid, userEmail)) {
    if (project.teamId) continue;
    if (project.status !== "active" || project.parentProjectId) continue;
    projects.push(await toPortfolioRow(project));
  }

  sortPortfolioRows(projects);

  return {
    teamId: "personal",
    generatedAt: now.toISOString(),
    projects,
  };
}
