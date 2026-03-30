import { Response } from "express";

import { AuthenticatedRequest } from "./authController";
import {
  listProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  addPhase,
  updatePhase,
  deletePhase,
  canAccessProject,
  canEditProject,
  CreateProjectInput,
  UpdateProjectInput,
  CreatePhaseInput,
  UpdatePhaseInput,
} from "../services/projectService";
import { listTodos } from "../services/todoService";
import { NotFoundError, ForbiddenError } from "../utils/errors";

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
  const input: CreateProjectInput = {
    name: req.body.name,
    description: req.body.description,
    teamId: req.body.teamId,
  };
  const project = createProject(req.user!.uid, req.user!.email, input);
  res.status(201).json(project);
}

export async function update(req: AuthenticatedRequest, res: Response) {
  const id = req.params.id as string;
  const input: UpdateProjectInput = {};
  if (req.body.name !== undefined) input.name = req.body.name;
  if (req.body.description !== undefined) input.description = req.body.description;
  if (req.body.teamId !== undefined) input.teamId = req.body.teamId;
  if (req.body.status !== undefined) input.status = req.body.status;
  const project = updateProject(req.user!.uid, req.user!.email, id, input);
  res.status(200).json(project);
}

export async function remove(req: AuthenticatedRequest, res: Response) {
  const id = req.params.id as string;
  deleteProject(req.user!.uid, id);
  res.status(204).end();
}

export async function getTodos(req: AuthenticatedRequest, res: Response) {
  const id = req.params.id as string;
  const project = getProjectById(id);
  if (!project) throw new NotFoundError("Projet introuvable");

  if (!canAccessProject(req.user!.uid, req.user!.email, project)) {
    throw new ForbiddenError("Accès refusé");
  }

  const allTodos = listTodos(req.user!.uid);
  const directTodos = allTodos.filter((t) => t.projectId === project.id);
  const directIds = new Set(directTodos.map((t) => t.id));
  const subtasks = allTodos.filter((t) => t.parentId && directIds.has(t.parentId) && !directIds.has(t.id));
  res.status(200).json([...directTodos, ...subtasks]);
}

// ── Phases ──

export async function createPhase(req: AuthenticatedRequest, res: Response) {
  const projectId = req.params.id as string;
  const project = getProjectById(projectId);
  if (!project) throw new NotFoundError("Projet introuvable");
  if (!canEditProject(req.user!.uid, req.user!.email, project)) {
    throw new ForbiddenError("Accès réservé aux propriétaires et administrateurs");
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
  if (!canEditProject(req.user!.uid, req.user!.email, project)) {
    throw new ForbiddenError("Accès réservé aux propriétaires et administrateurs");
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
  if (!canEditProject(req.user!.uid, req.user!.email, project)) {
    throw new ForbiddenError("Accès réservé aux propriétaires et administrateurs");
  }

  const phaseId = req.params.phaseId as string;
  deletePhase(projectId, phaseId);
  res.status(204).end();
}
