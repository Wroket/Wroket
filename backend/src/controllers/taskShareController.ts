import { Response } from "express";
import rateLimit from "express-rate-limit";

import { AuthenticatedRequest } from "./authController";
import {
  createTaskShareLink,
  getSharedTaskView,
  listTaskShareLinksForTodo,
  revokeTaskShareLink,
} from "../services/taskShareLinkService";
import type { ShareLinkExpiryDays } from "../services/projectShareLinkService";
import { findTodoForUser } from "../services/todoService";
import { ForbiddenError, NotFoundError } from "../utils/errors";

export const publicTaskShareLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de requêtes — réessayez dans une minute", code: "TASK_SHARE_RATE_LIMIT" },
});

export async function getPublicSharedTask(req: AuthenticatedRequest, res: Response) {
  const token = req.params.token as string;
  const view = await getSharedTaskView(token);
  res.status(200).json(view);
}

export async function listTodoShareLinks(req: AuthenticatedRequest, res: Response) {
  const todoId = req.params.id as string;
  const lookup = await findTodoForUser(req.user!.uid, todoId, req.user!.email ?? "");
  if (!lookup) throw new NotFoundError("Tâche introuvable");
  if (!lookup.isOwner) throw new ForbiddenError("Accès refusé");
  res.status(200).json({ links: listTaskShareLinksForTodo(todoId) });
}

export async function createTodoShareLinkHandler(req: AuthenticatedRequest, res: Response) {
  const todoId = req.params.id as string;
  const label = typeof req.body?.label === "string" ? req.body.label : null;
  const rawDays = req.body?.expiryDays;
  let expiryDays: ShareLinkExpiryDays = 30;
  if (rawDays === null || rawDays === "never") expiryDays = null;
  else if (rawDays === 7 || rawDays === 30 || rawDays === 90) expiryDays = rawDays;

  const link = await createTaskShareLink(req.user!.uid, req.user!.email ?? "", todoId, {
    label,
    expiryDays,
  });
  res.status(201).json(link);
}

export async function revokeTodoShareLinkHandler(req: AuthenticatedRequest, res: Response) {
  const todoId = req.params.id as string;
  const linkId = req.params.linkId as string;
  const link = await revokeTaskShareLink(req.user!.uid, req.user!.email ?? "", todoId, linkId);
  res.status(200).json(link);
}
