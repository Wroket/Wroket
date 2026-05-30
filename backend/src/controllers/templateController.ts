import { Response } from "express";

import { AuthenticatedRequest } from "./authController";
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  type CreateTemplateInput,
  type UpdateTemplateInput,
} from "../services/templateService";

export function list(req: AuthenticatedRequest, res: Response): void {
  const templates = listTemplates(req.user!.uid);
  res.status(200).json(templates);
}

export function create(req: AuthenticatedRequest, res: Response): void {
  const input = req.body as CreateTemplateInput;
  const template = createTemplate(req.user!.uid, input);
  res.status(201).json(template);
}

export function update(req: AuthenticatedRequest, res: Response): void {
  const templateId = req.params.id as string;
  const input = req.body as UpdateTemplateInput;
  const template = updateTemplate(req.user!.uid, templateId, input);
  res.status(200).json(template);
}

export function remove(req: AuthenticatedRequest, res: Response): void {
  const templateId = req.params.id as string;
  deleteTemplate(req.user!.uid, templateId);
  res.status(204).send();
}
