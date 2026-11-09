import type { AuthUser } from "../authService";
import { canAccessProject, getProjectById, listProjects } from "../projectService";
import {
  computeProjectSteeringSnapshot,
  isEffectivelyOverdue,
} from "../projectSteeringService";
import {
  formatMyWeekDigest,
  formatOverdueDigest,
  formatTeamRiskDigest,
} from "../pmoDigestService";
import { search } from "../searchService";
import { listAssignedToMe, listProjectTodos, listTodos, type Todo } from "../todoService";
import { ForbiddenError, NotFoundError } from "../../utils/errors";
import type { McpToolDef, McpToolHandler } from "./types";
import { clampLimit, requireString } from "./types";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function leanPmoTodo(t: Todo) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    effort: t.effort,
    deadline: t.deadline,
    startDate: t.startDate,
    projectId: t.projectId,
    phaseId: t.phaseId,
    scheduledSlot: t.scheduledSlot,
    assignedTo: t.assignedTo ?? null,
    assignmentStatus: t.assignmentStatus ?? null,
    overdue: isEffectivelyOverdue(t),
  };
}

export const pmoToolDefs: McpToolDef[] = [
  {
    name: "get_my_week",
    description:
      "Get the user's weekly focus ('Ma semaine'): active overdue tasks plus tasks due or scheduled within the next 7 days, along with a formatted PMO summary.",
    requiredScope: "todos:read",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max tasks to return (default 25, max 100)" },
      },
    },
  },
  {
    name: "get_overdue_tasks",
    description:
      "List active overdue tasks (owned by or assigned to the user) sorted by urgency, plus a formatted PMO summary.",
    requiredScope: "todos:read",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max tasks to return (default 25, max 100)" },
      },
    },
  },
  {
    name: "get_team_risk",
    description:
      "Analyze team projects accessible to the user and return projects that are 'overdue' or 'at-risk' with overdue task counts and health status.",
    requiredScope: "projects:read",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_project_steering",
    description:
      "Compute the executive PMO steering snapshot for a project (overall health, completion ratio, per-phase health, upcoming milestones, top overdue tasks, tasks due within 3 days).",
    requiredScope: "projects:read",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project id" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "search_workspace",
    description:
      "Full-text search across the user's Wroket workspace: tasks, projects, notes, tags, contacts, and user databases (minimum 3 characters).",
    requiredScope: "todos:read",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query (min 3 chars)" },
        type: {
          type: "string",
          enum: ["todo", "project", "note", "contact", "database", "tag"],
          description: "Optional filter by entity type",
        },
      },
      required: ["query"],
    },
  },
];

async function getMyWeekHandler(user: AuthUser, args: Record<string, unknown>) {
  const now = new Date();
  const limit = clampLimit(args.limit, 25, 100);
  const [mine, assigned, summary] = await Promise.all([
    listTodos(user.uid),
    listAssignedToMe(user.uid),
    formatMyWeekDigest(user.uid, now),
  ]);
  const seen = new Set<string>();
  const items = [...mine, ...assigned]
    .filter((t) => {
      if (seen.has(t.id) || t.status !== "active") return false;
      seen.add(t.id);
      if (isEffectivelyOverdue(t, now)) return true;
      if (t.scheduledSlot?.start) {
        const ms = Date.parse(t.scheduledSlot.start);
        if (Number.isFinite(ms) && ms >= now.getTime() && ms <= now.getTime() + WEEK_MS) return true;
      }
      if (t.deadline?.trim()) {
        const ms = Date.parse(t.deadline.trim());
        if (Number.isFinite(ms) && ms >= now.getTime() && ms <= now.getTime() + WEEK_MS) return true;
      }
      return false;
    })
    .slice(0, limit)
    .map(leanPmoTodo);

  return {
    summary,
    count: items.length,
    tasks: items,
  };
}

async function getOverdueTasksHandler(user: AuthUser, args: Record<string, unknown>) {
  const now = new Date();
  const limit = clampLimit(args.limit, 25, 100);
  const [mine, assigned, summary] = await Promise.all([
    listTodos(user.uid),
    listAssignedToMe(user.uid),
    formatOverdueDigest(user.uid, now),
  ]);
  const seen = new Set<string>();
  const overdue = [...mine, ...assigned]
    .filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return t.status === "active" && isEffectivelyOverdue(t, now);
    })
    .slice(0, limit)
    .map(leanPmoTodo);

  return {
    summary,
    count: overdue.length,
    tasks: overdue,
  };
}

async function getTeamRiskHandler(user: AuthUser, _args: Record<string, unknown>) {
  const now = new Date();
  const summary = await formatTeamRiskDigest(user.uid, now);
  const projects = listProjects(user.uid, user.email).filter((p) => p.status === "active");
  const risks: Array<{
    projectId: string;
    name: string;
    teamId: string | null;
    health: string;
    overdueCount: number;
    atRiskCount: number;
    completionRatio: number | null;
  }> = [];

  for (const project of projects) {
    const todos = await listProjectTodos(project.id);
    const snap = computeProjectSteeringSnapshot(project, todos, now);
    if (snap.health === "overdue" || snap.health === "at-risk" || snap.overdueCount > 0) {
      risks.push({
        projectId: project.id,
        name: project.name,
        teamId: project.teamId ?? null,
        health: snap.health,
        overdueCount: snap.overdueCount,
        atRiskCount: snap.atRiskCount,
        completionRatio: snap.completionRatio,
      });
    }
  }

  return {
    summary,
    atRiskProjects: risks,
  };
}

async function getProjectSteeringHandler(user: AuthUser, args: Record<string, unknown>) {
  const projectId = requireString(args, "projectId");
  const project = getProjectById(projectId);
  if (!project) throw new NotFoundError("Projet introuvable");
  if (!canAccessProject(user.uid, user.email, project)) {
    throw new ForbiddenError("Accès au projet refusé");
  }
  const todos = await listProjectTodos(projectId);
  const snapshot = computeProjectSteeringSnapshot(project, todos);
  return {
    projectId: project.id,
    projectName: project.name,
    ...snapshot,
  };
}

async function searchWorkspaceHandler(user: AuthUser, args: Record<string, unknown>) {
  const query = requireString(args, "query");
  const results = await search(user.uid, query, user.email);
  const typeFilter = typeof args.type === "string" ? args.type : undefined;
  const filtered = typeFilter ? results.filter((r) => r.type === typeFilter) : results;
  return {
    query,
    count: filtered.length,
    results: filtered,
  };
}

export const pmoHandlers: Record<string, McpToolHandler> = {
  get_my_week: getMyWeekHandler,
  get_overdue_tasks: getOverdueTasksHandler,
  get_team_risk: getTeamRiskHandler,
  get_project_steering: getProjectSteeringHandler,
  search_workspace: searchWorkspaceHandler,
};
