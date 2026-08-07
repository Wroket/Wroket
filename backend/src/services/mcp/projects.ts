import type { AuthUser } from "../authService";
import {
  canAccessProject,
  getProjectById,
  listProjects,
  type Project,
  type ProjectPhase,
} from "../projectService";
import { ForbiddenError, NotFoundError } from "../../utils/errors";
import type { McpToolDef, McpToolHandler } from "./types";
import { requireString } from "./types";

function leanPhase(p: ProjectPhase): Record<string, unknown> {
  return {
    id: p.id,
    projectId: p.projectId,
    name: p.name,
    color: p.color,
    order: p.order,
    startDate: p.startDate,
    endDate: p.endDate,
  };
}

function leanProject(p: Project): Record<string, unknown> {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status,
    teamId: p.teamId ?? null,
    parentProjectId: p.parentProjectId ?? null,
    tags: p.tags ?? [],
    phaseCount: p.phases?.length ?? 0,
    updatedAt: p.updatedAt,
    createdAt: p.createdAt,
  };
}

function requireAccessibleProject(user: AuthUser, projectId: string): Project {
  const project = getProjectById(projectId);
  if (!project) throw new NotFoundError("Projet introuvable");
  if (!canAccessProject(user.uid, user.email, project)) {
    throw new ForbiddenError("Accès au projet refusé");
  }
  return project;
}

export const projectToolDefs: McpToolDef[] = [
  {
    name: "list_projects",
    description: "List projects accessible to the user (ids useful for create_todo / move_todo).",
    requiredScope: "projects:read",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_project",
    description: "Get one project by id (includes phase summary).",
    requiredScope: "projects:read",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Project id" } },
      required: ["id"],
    },
  },
  {
    name: "list_project_phases",
    description: "List phases of a project (ids for create_todo / move_todo).",
    requiredScope: "projects:read",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
  },
];

function listProjectsHandler(user: AuthUser, _args: Record<string, unknown>) {
  const projects = listProjects(user.uid, user.email);
  return { projects: projects.map(leanProject) };
}

function getProjectHandler(user: AuthUser, args: Record<string, unknown>) {
  const id = requireString(args, "id");
  const project = requireAccessibleProject(user, id);
  return {
    ...leanProject(project),
    phases: (project.phases ?? []).map(leanPhase),
  };
}

function listPhasesHandler(user: AuthUser, args: Record<string, unknown>) {
  const projectId = requireString(args, "projectId");
  const project = requireAccessibleProject(user, projectId);
  const phases = [...(project.phases ?? [])].sort((a, b) => a.order - b.order);
  return { projectId, phases: phases.map(leanPhase) };
}

export const projectHandlers: Record<string, McpToolHandler> = {
  list_projects: listProjectsHandler,
  get_project: getProjectHandler,
  list_project_phases: listPhasesHandler,
};
