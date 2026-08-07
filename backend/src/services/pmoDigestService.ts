/**
 * PMO digests for chat slash commands (Slack Lot 4+, reused by Teams/Chat/Discord).
 */

import { findUserByUid } from "./authService";
import { taskDeepLink } from "./notificationFormatting";
import { listProjects } from "./projectService";
import {
  computeProjectSteeringSnapshot,
  isEffectivelyOverdue,
  type ProjectHealth,
} from "./projectSteeringService";
import { listUserTeams } from "./teamService";
import { listAssignedToMe, listProjectTodos, listTodos, type Todo } from "./todoService";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LINES = 10;

function formatTodoLine(todo: Todo): string {
  const link = taskDeepLink(todo.id);
  const overdue = isEffectivelyOverdue(todo) ? " · en retard" : "";
  const linkPart = link ? ` <${link}|ouvrir>` : "";
  return `• *${todo.title}* \`${todo.id}\`${overdue}${linkPart}`;
}

function weekFocusSort(a: Todo, b: Todo, now: Date): number {
  const overdueA = isEffectivelyOverdue(a, now) ? 0 : 1;
  const overdueB = isEffectivelyOverdue(b, now) ? 0 : 1;
  if (overdueA !== overdueB) return overdueA - overdueB;
  const da = a.deadline ? Date.parse(a.deadline) : Number.POSITIVE_INFINITY;
  const db = b.deadline ? Date.parse(b.deadline) : Number.POSITIVE_INFINITY;
  return da - db;
}

function inWeekFocus(todo: Todo, now: Date): boolean {
  if (todo.status !== "active") return false;
  if (isEffectivelyOverdue(todo, now)) return true;
  if (todo.scheduledSlot?.start) {
    const t = Date.parse(todo.scheduledSlot.start);
    if (Number.isFinite(t) && t >= now.getTime() && t <= now.getTime() + WEEK_MS) return true;
  }
  if (todo.deadline?.trim()) {
    const t = Date.parse(todo.deadline.trim());
    if (Number.isFinite(t) && t >= now.getTime() && t <= now.getTime() + WEEK_MS) return true;
  }
  return false;
}

/**
 * Personal "Ma semaine" style list (overdue + due/booked within 7 days).
 */
export async function formatMyWeekDigest(actorUid: string, now: Date = new Date()): Promise<string> {
  const [mine, assigned] = await Promise.all([listTodos(actorUid), listAssignedToMe(actorUid)]);
  const pool = [...mine, ...assigned];
  const seen = new Set<string>();
  const focus = pool
    .filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return inWeekFocus(t, now);
    })
    .sort((a, b) => weekFocusSort(a, b, now))
    .slice(0, MAX_LINES);

  if (focus.length === 0) {
    return "Aucune tâche pour *Ma semaine* (pas de retard ni d’échéance/créneau sous 7 jours).";
  }
  return [`*Ma semaine* (${focus.length}) :`, ...focus.map(formatTodoLine)].join("\n");
}

/**
 * Active overdue tasks (personal + assigned to actor).
 */
export async function formatOverdueDigest(actorUid: string, now: Date = new Date()): Promise<string> {
  const [mine, assigned] = await Promise.all([listTodos(actorUid), listAssignedToMe(actorUid)]);
  const seen = new Set<string>();
  const overdue = [...mine, ...assigned]
    .filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return t.status === "active" && isEffectivelyOverdue(t, now);
    })
    .sort((a, b) => weekFocusSort(a, b, now))
    .slice(0, MAX_LINES);

  if (overdue.length === 0) return "Aucune tâche active en retard.";
  return [`*En retard* (${overdue.length}) :`, ...overdue.map(formatTodoLine)].join("\n");
}

const RISK_HEALTH: ProjectHealth[] = ["overdue", "at-risk"];

/**
 * Team/project risk digest for teams the user belongs to.
 */
export async function formatTeamRiskDigest(actorUid: string, now: Date = new Date()): Promise<string> {
  const user = findUserByUid(actorUid);
  const email = user?.email ?? "";
  const teams = listUserTeams(actorUid, email);
  if (teams.length === 0) {
    return "Vous n’êtes membre d’aucune équipe Wroket — `/wroket team-risk` nécessite un accès équipe.";
  }

  const projects = listProjects(actorUid, email).filter((p) => p.status === "active" && p.teamId);
  const rows: { name: string; health: ProjectHealth; overdueCount: number; projectId: string }[] = [];

  for (const project of projects) {
    const todos = await listProjectTodos(project.id);
    const snap = computeProjectSteeringSnapshot(project, todos, now);
    if (!RISK_HEALTH.includes(snap.health) && snap.overdueCount === 0) continue;
    rows.push({
      name: project.name,
      health: snap.health,
      overdueCount: snap.overdueCount,
      projectId: project.id,
    });
  }

  rows.sort((a, b) => {
    const rank = (h: ProjectHealth) => (h === "overdue" ? 0 : h === "at-risk" ? 1 : 2);
    return rank(a.health) - rank(b.health) || b.overdueCount - a.overdueCount;
  });

  const top = rows.slice(0, 5);
  if (top.length === 0) {
    return "Aucun projet d’équipe en risque ou en retard sur votre périmètre.";
  }

  const lines = top.map(
    (r) =>
      `• *${r.name}* — \`${r.health}\` · ${r.overdueCount} en retard · \`${r.projectId}\``,
  );
  return [`*Risques équipe* (${top.length}) :`, ...lines].join("\n");
}
