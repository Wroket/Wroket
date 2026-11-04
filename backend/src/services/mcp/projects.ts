import type { AuthUser } from "../authService";
import { assertCustomFieldsEntitlement } from "../customFieldService";
import { cascadeProjectNoteFoldersOnDelete } from "../projectNoteFolderCascade";
import {
  addCustomFieldDef,
  addMilestone,
  addPhase,
  canAccessProject,
  canEditProject,
  canEditProjectContent,
  createProject,
  deleteCustomFieldDef,
  deleteMilestone,
  deletePhase,
  deleteProject,
  getProjectById,
  listChildProjects,
  listProjects,
  updateCustomFieldDef,
  updateMilestone,
  updatePhase,
  updateProject,
  type CustomFieldType,
  type Project,
  type ProjectMilestone,
  type ProjectPhase,
} from "../projectService";
import { seedProjectTemplate } from "../projectTemplateSeedService";
import {
  clearProjectPhaseReferences,
  permanentlyPurgeTodosByProjectId,
} from "../todoService";
import { ForbiddenError, NotFoundError, ValidationError } from "../../utils/errors";
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

function leanMilestone(m: ProjectMilestone): Record<string, unknown> {
  return {
    id: m.id,
    projectId: m.projectId,
    title: m.title,
    date: m.date,
    phaseId: m.phaseId ?? null,
    color: m.color,
    order: m.order,
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
    milestoneCount: p.milestones?.length ?? 0,
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
  {
    name: "delete_project",
    description:
      "Permanently delete a project (and its direct subprojects and project tasks).",
    requiredScope: "projects:write",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Project id" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_project_phase",
    description:
      "Delete a phase from a project (tasks in that phase are kept in the project with phaseId cleared).",
    requiredScope: "projects:write",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project id" },
        phaseId: { type: "string", description: "Phase id" },
      },
      required: ["projectId", "phaseId"],
    },
  },
  {
    name: "seed_project_structure",
    description:
      "Create or populate a structured project in one call: creates phases, tasks, and subtasks. Provide either an existing projectId or a projectName to create a new project first.",
    requiredScope: "projects:write",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Existing project id (optional if projectName is provided)" },
        projectName: { type: "string", description: "New project name to create if projectId is omitted" },
        projectDescription: { type: "string", description: "Optional description when creating a new project" },
        teamId: { type: ["string", "null"], description: "Optional teamId when creating a new project" },
        phases: {
          type: "array",
          description: "Phases and their tasks/subtasks to create",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              tasks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    subtasks: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: { title: { type: "string" } },
                        required: ["title"],
                      },
                    },
                  },
                  required: ["title"],
                },
              },
            },
            required: ["name", "tasks"],
          },
        },
      },
      required: ["phases"],
    },
  },
  {
    name: "list_project_milestones",
    description: "List milestones (key dates / deliverables) of a project.",
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
    name: "create_project_milestone",
    description: "Add a milestone (title + YYYY-MM-DD date) to a project.",
    requiredScope: "projects:write",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project id" },
        title: { type: "string", description: "Milestone title" },
        date: { type: "string", description: "ISO date YYYY-MM-DD" },
        phaseId: { type: ["string", "null"], description: "Optional linked phaseId" },
        color: { type: "string", description: "Optional hex color" },
      },
      required: ["projectId", "title", "date"],
    },
  },
  {
    name: "update_project_milestone",
    description: "Update a project milestone's title, date, phaseId, color, or order.",
    requiredScope: "projects:write",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project id" },
        milestoneId: { type: "string", description: "Milestone id" },
        title: { type: "string" },
        date: { type: "string" },
        phaseId: { type: ["string", "null"] },
        color: { type: "string" },
        order: { type: "number" },
      },
      required: ["projectId", "milestoneId"],
    },
  },
  {
    name: "delete_project_milestone",
    description: "Delete a milestone from a project.",
    requiredScope: "projects:write",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project id" },
        milestoneId: { type: "string", description: "Milestone id" },
      },
      required: ["projectId", "milestoneId"],
    },
  },
  {
    name: "manage_project_custom_fields",
    description:
      "List, create, update, or delete custom field definitions (columns) on a project (Small teams+).",
    requiredScope: "projects:write",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "create", "update", "delete"],
          description: "Operation to perform on project custom fields",
        },
        projectId: { type: "string", description: "Project id" },
        fieldId: { type: "string", description: "Field id (required for update/delete)" },
        name: { type: "string", description: "Field name (required for create)" },
        type: {
          type: "string",
          enum: ["text", "number", "date", "select", "checkbox"],
          description: "Field type (required for create)",
        },
        options: {
          type: "array",
          items: { type: "string" },
          description: "Select options when type='select'",
        },
        order: { type: "number" },
      },
      required: ["action", "projectId"],
    },
  },
];

function requireEditableProject(user: AuthUser, projectId: string): Project {
  const project = requireAccessibleProject(user, projectId);
  if (!canEditProjectContent(user.uid, user.email, project)) {
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
    milestones: (project.milestones ?? []).map(leanMilestone),
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

async function deleteProjectHandler(user: AuthUser, args: Record<string, unknown>) {
  const id = requireString(args, "id");
  const project = requireAccessibleProject(user, id);
  if (!canEditProject(user.uid, user.email, project)) {
    throw new ForbiddenError("Droits d'administration requis pour supprimer ce projet");
  }
  const directChildren = listChildProjects(id);
  for (const child of directChildren) {
    await permanentlyPurgeTodosByProjectId(child.id);
    deleteProject(user.uid, user.email, child.id);
    cascadeProjectNoteFoldersOnDelete(child.id);
  }
  deleteProject(user.uid, user.email, id);
  cascadeProjectNoteFoldersOnDelete(id);
  await permanentlyPurgeTodosByProjectId(id);
  return { deleted: true, id, name: project.name };
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

async function deletePhaseHandler(user: AuthUser, args: Record<string, unknown>) {
  const projectId = requireString(args, "projectId");
  const phaseId = requireString(args, "phaseId");
  requireEditableProject(user, projectId);
  deletePhase(projectId, phaseId);
  const detachedTodos = await clearProjectPhaseReferences(projectId, phaseId);
  return { deleted: true, projectId, phaseId, detachedTodos };
}

async function seedProjectStructureHandler(user: AuthUser, args: Record<string, unknown>) {
  let projectId = optionalString(args, "projectId");
  if (!projectId) {
    const projectName = optionalString(args, "projectName");
    if (!projectName) {
      throw new ValidationError("Fournissez projectId (projet existant) ou projectName (nouveau projet)");
    }
    const created = createProject(user.uid, user.email, {
      name: projectName,
      description: optionalString(args, "projectDescription"),
      teamId: args.teamId === null ? null : optionalString(args, "teamId") ?? null,
    });
    projectId = created.id;
  } else {
    requireEditableProject(user, projectId);
  }

  const seedResult = await seedProjectTemplate(user.uid, user.email, projectId, args.phases);
  const refreshed = getProjectById(projectId);
  return {
    projectId,
    ...seedResult,
    project: refreshed ? leanProject(refreshed) : null,
    phases: (refreshed?.phases ?? []).map(leanPhase),
  };
}

function listMilestonesHandler(user: AuthUser, args: Record<string, unknown>) {
  const projectId = requireString(args, "projectId");
  const project = requireAccessibleProject(user, projectId);
  return {
    projectId,
    milestones: (project.milestones ?? []).map(leanMilestone),
  };
}

function createMilestoneHandler(user: AuthUser, args: Record<string, unknown>) {
  const projectId = requireString(args, "projectId");
  requireEditableProject(user, projectId);
  const title = requireString(args, "title");
  const date = requireString(args, "date");
  const phaseId = args.phaseId === null ? null : optionalString(args, "phaseId") ?? null;
  const color = optionalString(args, "color");
  const milestone = addMilestone(projectId, { title, date, phaseId, color });
  return leanMilestone(milestone);
}

function updateMilestoneHandler(user: AuthUser, args: Record<string, unknown>) {
  const projectId = requireString(args, "projectId");
  const milestoneId = requireString(args, "milestoneId");
  requireEditableProject(user, projectId);
  const patch: Parameters<typeof updateMilestone>[2] = {};
  if (typeof args.title === "string") patch.title = args.title;
  if (typeof args.date === "string") patch.date = args.date;
  if (args.phaseId === null) patch.phaseId = null;
  else if (typeof args.phaseId === "string") patch.phaseId = args.phaseId;
  if (typeof args.color === "string") patch.color = args.color;
  if (typeof args.order === "number") patch.order = args.order;
  const milestone = updateMilestone(projectId, milestoneId, patch);
  return leanMilestone(milestone);
}

function deleteMilestoneHandler(user: AuthUser, args: Record<string, unknown>) {
  const projectId = requireString(args, "projectId");
  const milestoneId = requireString(args, "milestoneId");
  requireEditableProject(user, projectId);
  deleteMilestone(projectId, milestoneId);
  return { deleted: true, projectId, milestoneId };
}

function manageProjectCustomFieldsHandler(user: AuthUser, args: Record<string, unknown>) {
  const action = requireString(args, "action");
  const projectId = requireString(args, "projectId");

  if (action === "list") {
    const project = requireAccessibleProject(user, projectId);
    return { projectId, fields: project.customFieldDefs ?? [] };
  }

  requireEditableProject(user, projectId);
  assertCustomFieldsEntitlement(user.uid);

  if (action === "create") {
    const name = requireString(args, "name");
    const type = requireString(args, "type") as CustomFieldType;
    const options = Array.isArray(args.options)
      ? args.options.filter((o): o is string => typeof o === "string")
      : undefined;
    const def = addCustomFieldDef(projectId, { name, type, options });
    return { created: true, field: def };
  }

  if (action === "update") {
    const fieldId = requireString(args, "fieldId");
    const options = Array.isArray(args.options)
      ? args.options.filter((o): o is string => typeof o === "string")
      : undefined;
    const def = updateCustomFieldDef(projectId, fieldId, {
      name: optionalString(args, "name"),
      type: optionalString(args, "type") as CustomFieldType | undefined,
      options,
      order: typeof args.order === "number" ? args.order : undefined,
    });
    return { updated: true, field: def };
  }

  if (action === "delete") {
    const fieldId = requireString(args, "fieldId");
    deleteCustomFieldDef(projectId, fieldId);
    return { deleted: true, projectId, fieldId };
  }

  throw new ValidationError("action invalide");
}

export const projectHandlers: Record<string, McpToolHandler> = {
  list_projects: listProjectsHandler,
  get_project: getProjectHandler,
  list_project_phases: listPhasesHandler,
  create_project: createProjectHandler,
  update_project: updateProjectHandler,
  delete_project: deleteProjectHandler,
  create_project_phase: createPhaseHandler,
  update_project_phase: updatePhaseHandler,
  delete_project_phase: deletePhaseHandler,
  seed_project_structure: seedProjectStructureHandler,
  list_project_milestones: listMilestonesHandler,
  create_project_milestone: createMilestoneHandler,
  update_project_milestone: updateMilestoneHandler,
  delete_project_milestone: deleteMilestoneHandler,
  manage_project_custom_fields: manageProjectCustomFieldsHandler,
};
