import { Response } from "express";

import { AuthenticatedRequest } from "./authController";
import {
  listProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  reorderProjects,
  addPhase,
  updatePhase,
  deletePhase,
  canAccessProject,
  canEditProject,
  canEditProjectContent,
  CreateProjectInput,
  UpdateProjectInput,
  CreatePhaseInput,
  UpdatePhaseInput,
} from "../services/projectService";
import { listProjectTodos, clearProjectPhaseReferences } from "../services/todoService";
import { NotFoundError, ForbiddenError, ValidationError } from "../utils/errors";
import { logActivity } from "../services/activityLogService";

export async function list(req: AuthenticatedRequest, res: Response) {
  const projects = listProjects(req.user!.uid, req.user!.email);
  res.status(200).json(projects);
}

export async function get(req: AuthenticatedRequest, res: Response) {
  const id = req.params.id as string;
  const project = getProjectById(id);
  if (!project) throw new NotFoundError("Projet introuvable");

  if (!canAccessProject(req.user!.uid, req.user!.email, project)) {
    throw new ForbiddenError("Accès refusé");
  }

  res.status(200).json(project);
}

export async function create(req: AuthenticatedRequest, res: Response) {
  const { name, description, teamId, parentProjectId } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    throw new ValidationError("Le nom du projet est requis");
  }
  const input: CreateProjectInput = {
    name,
    description: typeof description === "string" ? description : undefined,
    teamId: typeof teamId === "string" ? teamId : undefined,
    parentProjectId: typeof parentProjectId === "string" ? parentProjectId : undefined,
  };
  const project = createProject(req.user!.uid, req.user!.email, input);
  logActivity(req.user!.uid, req.user!.email, "create", "project", project.id, { name: project.name });
  res.status(201).json(project);
}

export async function update(req: AuthenticatedRequest, res: Response) {
  const id = req.params.id as string;
  const body = req.body ?? {};
  const input: UpdateProjectInput = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string") throw new ValidationError("name doit être une chaîne");
    input.name = body.name;
  }
  if (body.description !== undefined) {
    if (typeof body.description !== "string") throw new ValidationError("description doit être une chaîne");
    input.description = body.description;
  }
  if (body.teamId !== undefined) input.teamId = typeof body.teamId === "string" ? body.teamId : null;
  if (body.status !== undefined) {
    if (body.status !== "active" && body.status !== "archived") {
      throw new ValidationError("status invalide (active | archived)");
    }
    input.status = body.status;
  }
  if (body.parentProjectId !== undefined) {
    input.parentProjectId = typeof body.parentProjectId === "string" ? body.parentProjectId : null;
  }
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags) || !body.tags.every((t: unknown) => typeof t === "string")) {
      throw new ValidationError("tags doit être un tableau de chaînes");
    }
    input.tags = body.tags;
  }
  const project = updateProject(req.user!.uid, req.user!.email, id, input);
  logActivity(req.user!.uid, req.user!.email, "update", "project", project.id, { name: project.name });
  res.status(200).json(project);
}

export async function remove(req: AuthenticatedRequest, res: Response) {
  const id = req.params.id as string;
  logActivity(req.user!.uid, req.user!.email, "delete", "project", id);
  deleteProject(req.user!.uid, req.user!.email, id);
  res.status(204).end();
}

export async function getTodos(req: AuthenticatedRequest, res: Response) {
  const id = req.params.id as string;
  const project = getProjectById(id);
  if (!project) throw new NotFoundError("Projet introuvable");

  if (!canAccessProject(req.user!.uid, req.user!.email, project)) {
    throw new ForbiddenError("Accès refusé");
  }

  const allProjectTodos = listProjectTodos(project.id);
  const directTodos = allProjectTodos.filter((t) => !t.parentId);
  const directIds = new Set(directTodos.map((t) => t.id));
  const subtasks = allProjectTodos.filter((t) => t.parentId && directIds.has(t.parentId));
  res.status(200).json([...directTodos, ...subtasks]);
}

export async function getAllTodos(req: AuthenticatedRequest, res: Response) {
  const projects = listProjects(req.user!.uid, req.user!.email);
  const result: Record<string, unknown[]> = {};
  for (const project of projects) {
    const todos = listProjectTodos(project.id).filter((t) => !t.parentId);
    if (todos.length > 0) result[project.id] = todos;
  }
  res.status(200).json(result);
}

export async function reorder(req: AuthenticatedRequest, res: Response) {
  const { projectIds } = req.body as { projectIds?: string[] };
  if (!Array.isArray(projectIds)) {
    res.status(400).json({ error: "projectIds requis" });
    return;
  }
  const updated = reorderProjects(req.user!.uid, req.user!.email, projectIds);
  res.status(200).json({ message: "OK", updated });
}

// ── Phases ──

export async function createPhase(req: AuthenticatedRequest, res: Response) {
  const projectId = req.params.id as string;
  const project = getProjectById(projectId);
  if (!project) throw new NotFoundError("Projet introuvable");
  if (!canEditProjectContent(req.user!.uid, req.user!.email, project)) {
    throw new ForbiddenError("Accès réservé (super-user minimum)");
  }

  const input: CreatePhaseInput = {
    name: req.body.name,
    color: req.body.color,
    startDate: req.body.startDate,
    endDate: req.body.endDate,
  };
  const phase = addPhase(projectId, input);
  res.status(201).json(phase);
}

export async function patchPhase(req: AuthenticatedRequest, res: Response) {
  const projectId = req.params.id as string;
  const project = getProjectById(projectId);
  if (!project) throw new NotFoundError("Projet introuvable");
  if (!canEditProjectContent(req.user!.uid, req.user!.email, project)) {
    throw new ForbiddenError("Accès réservé (super-user minimum)");
  }

  const phaseId = req.params.phaseId as string;
  const input: UpdatePhaseInput = {};
  if (req.body.name !== undefined) input.name = req.body.name;
  if (req.body.color !== undefined) input.color = req.body.color;
  if (req.body.order !== undefined) input.order = req.body.order;
  if (req.body.startDate !== undefined) input.startDate = req.body.startDate;
  if (req.body.endDate !== undefined) input.endDate = req.body.endDate;
  const phase = updatePhase(projectId, phaseId, input);
  res.status(200).json(phase);
}

export async function removePhase(req: AuthenticatedRequest, res: Response) {
  const projectId = req.params.id as string;
  const project = getProjectById(projectId);
  if (!project) throw new NotFoundError("Projet introuvable");
  if (!canEditProjectContent(req.user!.uid, req.user!.email, project)) {
    throw new ForbiddenError("Accès réservé (super-user minimum)");
  }

  const phaseId = req.params.phaseId as string;
  deletePhase(projectId, phaseId);
  clearProjectPhaseReferences(projectId, phaseId);
  res.status(204).end();
}
