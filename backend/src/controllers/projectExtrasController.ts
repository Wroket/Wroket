import { Response } from "express";

import { AuthenticatedRequest } from "./authController";
import {
  addCustomFieldDef,
  addMilestone,
  canAccessProject,
  canEditProjectContent,
  deleteCustomFieldDef,
  deleteMilestone,
  getProjectById,
  updateCustomFieldDef,
  updateMilestone,
} from "../services/projectService";
import { assertCustomFieldsEntitlement } from "../services/customFieldService";
import { listNotesForProject } from "../services/noteService";
import { ForbiddenError, NotFoundError } from "../utils/errors";

function assertProjectAccess(req: AuthenticatedRequest, projectId: string) {
  const project = getProjectById(projectId);
  if (!project) throw new NotFoundError("Projet introuvable");
  if (!canAccessProject(req.user!.uid, req.user!.email ?? "", project)) {
    throw new ForbiddenError("Accès refusé");
  }
  return project;
}

function assertProjectEdit(req: AuthenticatedRequest, projectId: string) {
  const project = assertProjectAccess(req, projectId);
  if (!canEditProjectContent(req.user!.uid, req.user!.email ?? "", project)) {
    throw new ForbiddenError("Accès refusé");
  }
  return project;
}

// ── Milestones ──

export async function listMilestones(req: AuthenticatedRequest, res: Response) {
  const project = assertProjectAccess(req, req.params.id as string);
  res.status(200).json({ milestones: project.milestones ?? [] });
}

export async function createMilestone(req: AuthenticatedRequest, res: Response) {
  const projectId = req.params.id as string;
  assertProjectEdit(req, projectId);
  const milestone = addMilestone(projectId, {
    title: req.body?.title,
    date: req.body?.date,
    phaseId: req.body?.phaseId ?? null,
    color: req.body?.color,
  });
  res.status(201).json(milestone);
}

export async function patchMilestone(req: AuthenticatedRequest, res: Response) {
  const projectId = req.params.id as string;
  const milestoneId = req.params.milestoneId as string;
  assertProjectEdit(req, projectId);
  const milestone = updateMilestone(projectId, milestoneId, {
    title: req.body?.title,
    date: req.body?.date,
    phaseId: req.body?.phaseId,
    color: req.body?.color,
    order: req.body?.order,
  });
  res.status(200).json(milestone);
}

export async function removeMilestone(req: AuthenticatedRequest, res: Response) {
  const projectId = req.params.id as string;
  const milestoneId = req.params.milestoneId as string;
  assertProjectEdit(req, projectId);
  deleteMilestone(projectId, milestoneId);
  res.status(204).end();
}

// ── Custom field definitions ──

export async function listCustomFieldDefs(req: AuthenticatedRequest, res: Response) {
  const project = assertProjectAccess(req, req.params.id as string);
  res.status(200).json({ fields: project.customFieldDefs ?? [] });
}

export async function createCustomFieldDef(req: AuthenticatedRequest, res: Response) {
  const projectId = req.params.id as string;
  assertProjectEdit(req, projectId);
  assertCustomFieldsEntitlement(req.user!.uid);
  const def = addCustomFieldDef(projectId, {
    name: req.body?.name,
    type: req.body?.type,
    options: req.body?.options,
  });
  res.status(201).json(def);
}

export async function patchCustomFieldDef(req: AuthenticatedRequest, res: Response) {
  const projectId = req.params.id as string;
  const fieldId = req.params.fieldId as string;
  assertProjectEdit(req, projectId);
  assertCustomFieldsEntitlement(req.user!.uid);
  const def = updateCustomFieldDef(projectId, fieldId, {
    name: req.body?.name,
    type: req.body?.type,
    options: req.body?.options,
    order: req.body?.order,
  });
  res.status(200).json(def);
}

export async function removeCustomFieldDef(req: AuthenticatedRequest, res: Response) {
  const projectId = req.params.id as string;
  const fieldId = req.params.fieldId as string;
  assertProjectEdit(req, projectId);
  assertCustomFieldsEntitlement(req.user!.uid);
  deleteCustomFieldDef(projectId, fieldId);
  res.status(204).end();
}

// ── Project notes (wiki) ──

export async function getProjectNotes(req: AuthenticatedRequest, res: Response) {
  const projectId = req.params.id as string;
  assertProjectAccess(req, projectId);
  const notes = listNotesForProject(req.user!.uid, projectId);
  res.status(200).json({ notes });
}
