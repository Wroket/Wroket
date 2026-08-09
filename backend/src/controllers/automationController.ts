import { Response } from "express";

import { AuthenticatedRequest } from "./authController";
import {
  createAutomationRule,
  deleteAutomationRule,
  listAutomationRulesForOwner,
  updateAutomationRule,
  type AutomationAction,
  type AutomationTrigger,
} from "../services/projectAutomationService";

export async function listAutomations(req: AuthenticatedRequest, res: Response) {
  res.status(200).json({ rules: listAutomationRulesForOwner(req.user!.uid) });
}

export async function createAutomationHandler(req: AuthenticatedRequest, res: Response) {
  const rule = createAutomationRule(req.user!.uid, {
    name: String(req.body?.name ?? ""),
    projectId: typeof req.body?.projectId === "string" ? req.body.projectId : null,
    trigger: req.body?.trigger as AutomationTrigger,
    action: req.body?.action as AutomationAction,
    actionValue: String(req.body?.actionValue ?? ""),
  });
  res.status(201).json(rule);
}

export async function updateAutomationHandler(req: AuthenticatedRequest, res: Response) {
  const rule = updateAutomationRule(req.user!.uid, req.params.id as string, {
    name: typeof req.body?.name === "string" ? req.body.name : undefined,
    enabled: typeof req.body?.enabled === "boolean" ? req.body.enabled : undefined,
    actionValue: typeof req.body?.actionValue === "string" ? req.body.actionValue : undefined,
  });
  res.status(200).json(rule);
}

export async function deleteAutomationHandler(req: AuthenticatedRequest, res: Response) {
  deleteAutomationRule(req.user!.uid, req.params.id as string);
  res.status(204).send();
}
