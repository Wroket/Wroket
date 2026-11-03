import type { AuthUser } from "../authService";
import {
  addPhase,
  canAccessProject,
  canEditProject,
  createProject,
  getProjectById,
  listProjects,
  updatePhase,
  updateProject,
  type Project,
  type ProjectPhase,
} from "../projectService";
import { ForbiddenError, NotFoundError } from "../../utils/errors";
import type { McpToolDef, McpToolHandler } from "./types";
import { optionalString, requireString } from "./types";

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
  {
    name: "create_project",
    description: "Create a new personal or team project.",
    requiredScope: "projects:write",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project name" },
        description: { type: "string", description: "Optional project description" },
        teamId: { type: ["string", "null"], description: "Optional team id" },
        parentProjectId: { type: ["string", "null"], description: "Optional parent project id" },
      },
      required: ["name"],
    },
  },
  {
    name: "update_project",
    description: "Update a project's name, description, status ('active' | 'archived'), or tags.",
    requiredScope: "projects:write",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Project id" },
        name: { type: "string" },
        description: { type: "string" },
        status: { type: "string", enum: ["active", "archived"] },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["id"],
    },
  },
  {
    name: "create_project_phase",
    description: "Add a phase (column / timeline stage) to a project.",
    requiredScope: "projects:write",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project id" },
        name: { type: "string", description: "Phase name" },
        color: { type: "string", description: "Optional hex color (e.g. #10b981)" },
        startDate: { type: ["string", "null"], description: "Optional start date YYYY-MM-DD" },
        endDate: { type: ["string", "null"], description: "Optional end date YYYY-MM-DD" },
      },
      required: ["projectId", "name"],
    },
  },
  {
    name: "update_project_phase",
    description: "Update a project phase's name, color, startDate, endDate, or order.",
    requiredScope: "projects:write",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project id" },
        phaseId: { type: "string", description: "Phase id" },
        name: { type: "string" },
        color: { type: "string" },
        startDate: { type: ["string", "null"] },
        endDate: { type: ["string", "null"] },
        order: { type: "number" },
      },
      required: ["projectId", "phaseId"],
    },
  },
];

function requireEditableProject(user: AuthUser, projectId: string): Project {
  const project = requireAccessibleProject(user, projectId);
  if (!canEditProject(user.uid, user.email, project)) {
    throw new ForbiddenError("Droits d'édition requis sur ce projet");
  }
  return project;
}

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

function createProjectHandler(user: AuthUser, args: Record<string, unknown>) {
  const name = requireString(args, "name");
  const description = optionalString(args, "description");
  const teamId = args.teamId === null ? null : optionalString(args, "teamId") ?? null;
  const parentProjectId =
    args.parentProjectId === null ? null : optionalString(args, "parentProjectId") ?? null;
  const created = createProject(user.uid, user.email, {
    name,
    description,
    teamId,
    parentProjectId,
  });
  return leanProject(created);
}

function updateProjectHandler(user: AuthUser, args: Record<string, unknown>) {
  const id = requireString(args, "id");
  const patch: Parameters<typeof updateProject>[3] = {};
  if (typeof args.name === "string") patch.name = args.name;
  if (typeof args.description === "string") patch.description = args.description;
  if (args.status === "active" || args.status === "archived") patch.status = args.status;
  if (Array.isArray(args.tags)) {
    patch.tags = args.tags.filter((t): t is string => typeof t === "string");
  }
  const updated = updateProject(user.uid, user.email, id, patch);
  return leanProject(updated);
}

function createPhaseHandler(user: AuthUser, args: Record<string, unknown>) {
  const projectId = requireString(args, "projectId");
  requireEditableProject(user, projectId);
  const name = requireString(args, "name");
  const color = optionalString(args, "color");
  const startDate = args.startDate === null ? null : optionalString(args, "startDate") ?? null;
  const endDate = args.endDate === null ? null : optionalString(args, "endDate") ?? null;
  const phase = addPhase(projectId, { name, color, startDate, endDate });
  return leanPhase(phase);
}

function updatePhaseHandler(user: AuthUser, args: Record<string, unknown>) {
  const projectId = requireString(args, "projectId");
  const phaseId = requireString(args, "phaseId");
  requireEditableProject(user, projectId);
  const patch: Parameters<typeof updatePhase>[2] = {};
  if (typeof args.name === "string") patch.name = args.name;
  if (typeof args.color === "string") patch.color = args.color;
  if (args.startDate === null) patch.startDate = null;
  else if (typeof args.startDate === "string") patch.startDate = args.startDate;
  if (args.endDate === null) patch.endDate = null;
  else if (typeof args.endDate === "string") patch.endDate = args.endDate;
  if (typeof args.order === "number") patch.order = args.order;
  const phase = updatePhase(projectId, phaseId, patch);
  return leanPhase(phase);
}

export const projectHandlers: Record<string, McpToolHandler> = {
  list_projects: listProjectsHandler,
  get_project: getProjectHandler,
  list_project_phases: listPhasesHandler,
  create_project: createProjectHandler,
  update_project: updateProjectHandler,
  create_project_phase: createPhaseHandler,
  update_project_phase: updatePhaseHandler,
};
