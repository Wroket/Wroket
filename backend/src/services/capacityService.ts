import { ForbiddenError, NotFoundError, PaymentRequiredError } from "../utils/errors";
import { findUserByEmail, findUserByUid, getEntitlementsForUid } from "./authService";
import { getTeam, getTeamRole } from "./teamService";
import { listActiveProjectIdsForTeam, getProjectById } from "./projectService";
import { listProjectTodos } from "./todoService";
import { sumMinutesForTodoIds } from "./timeSessionService";

export interface CapacityMemberRow {
  uid: string;
  email: string;
  estimatedMinutes: number;
  trackedMinutes: number;
  overload: boolean;
}

export interface CapacityWeekSnapshot {
  teamId: string;
  weekStart: string;
  weekEnd: string;
  weeklyCapacityMinutes: number;
  members: CapacityMemberRow[];
}

const DEFAULT_WEEKLY_CAPACITY = 40 * 60;

function startOfUtcWeek(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  const day = x.getUTCDay();
  const delta = (day + 6) % 7;
  x.setUTCDate(x.getUTCDate() - delta);
  return x;
}

/**
 * Aggregate estimatedMinutes + tracked time for team project todos.
 */
export async function getTeamCapacitySnapshot(
  uid: string,
  userEmail: string,
  teamId: string,
  weekStartIso?: string,
): Promise<CapacityWeekSnapshot> {
  if (!getEntitlementsForUid(uid).teamReporting) {
    throw new PaymentRequiredError(
      "La capacité équipe nécessite le palier Large teams.",
      "CAPACITY_PLAN_REQUIRED",
    );
  }
  const team = getTeam(teamId);
  if (!team) throw new NotFoundError("Équipe introuvable");
  if (!getTeamRole(team, uid, userEmail)) {
    throw new ForbiddenError("Accès refusé");
  }

  const weekStart = weekStartIso ? startOfUtcWeek(new Date(weekStartIso)) : startOfUtcWeek(new Date());
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  const memberEmails = new Map<string, string>();
  const owner = findUserByUid(team.ownerUid);
  if (owner) memberEmails.set(owner.uid, owner.email);
  for (const m of team.members) {
    const u = findUserByEmail(m.email);
    if (u) memberEmails.set(u.uid, u.email);
  }

  const estByUser = new Map<string, number>();
  const todoIds: string[] = [];
  const todoOwner: Record<string, string> = {};

  for (const projectId of listActiveProjectIdsForTeam(teamId)) {
    const project = getProjectById(projectId);
    if (!project) continue;
    const todos = await listProjectTodos(project.id);
    for (const t of todos) {
      if (t.status !== "active" || t.parentId) continue;
      const assignee = t.assignedTo || t.userId;
      const est = t.estimatedMinutes ?? 0;
      estByUser.set(assignee, (estByUser.get(assignee) ?? 0) + est);
      todoIds.push(t.id);
      todoOwner[t.id] = assignee;
    }
  }

  const trackedByTodo = sumMinutesForTodoIds(todoIds);
  const trackedByUser = new Map<string, number>();
  for (const [todoId, mins] of Object.entries(trackedByTodo)) {
    const u = todoOwner[todoId];
    if (!u) continue;
    trackedByUser.set(u, (trackedByUser.get(u) ?? 0) + mins);
  }

  const members: CapacityMemberRow[] = [...memberEmails.entries()].map(([memberUid, email]) => {
    const estimatedMinutes = estByUser.get(memberUid) ?? 0;
    const trackedMinutes = trackedByUser.get(memberUid) ?? 0;
    const load = Math.max(estimatedMinutes, trackedMinutes);
    return {
      uid: memberUid,
      email,
      estimatedMinutes,
      trackedMinutes,
      overload: load > DEFAULT_WEEKLY_CAPACITY,
    };
  });

  return {
    teamId,
    weekStart: weekStart.toISOString().slice(0, 10),
    weekEnd: weekEnd.toISOString().slice(0, 10),
    weeklyCapacityMinutes: DEFAULT_WEEKLY_CAPACITY,
    members: members.sort((a, b) => b.estimatedMinutes - a.estimatedMinutes),
  };
}
