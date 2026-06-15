import { Response } from "express";
import rateLimit from "express-rate-limit";

import { AuthenticatedRequest } from "./authController";
import {
  createProjectShareLink,
  getSharedProjectView,
  listShareLinksForProject,
  revokeProjectShareLink,
  type ShareLinkExpiryDays,
  type ShareLinkTab,
  ALL_SHARE_TABS,
} from "../services/projectShareLinkService";
import { canEditProject, getProjectById } from "../services/projectService";
import { ForbiddenError, NotFoundError } from "../utils/errors";

export const publicShareLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de requêtes — réessayez dans une minute", code: "SHARE_RATE_LIMIT" },
});

export async function getPublicSharedProject(req: AuthenticatedRequest, res: Response) {
  const token = req.params.token as string;
  const view = getSharedProjectView(token);
  res.status(200).json(view);
}

export async function listProjectShareLinks(req: AuthenticatedRequest, res: Response) {
  const projectId = req.params.id as string;
  const project = getProjectById(projectId);
  if (!project) throw new NotFoundError("Projet introuvable");
  if (!canEditProject(req.user!.uid, req.user!.email ?? "", project)) {
    throw new ForbiddenError("Accès refusé");
  }
  res.status(200).json({ links: listShareLinksForProject(projectId) });
}

export async function createProjectShareLinkHandler(req: AuthenticatedRequest, res: Response) {
  const projectId = req.params.id as string;
  const label = typeof req.body?.label === "string" ? req.body.label : null;
  const rawDays = req.body?.expiryDays;
  let expiryDays: ShareLinkExpiryDays = 30;
  if (rawDays === null || rawDays === "never") expiryDays = null;
  else if (rawDays === 7 || rawDays === 30 || rawDays === 90) expiryDays = rawDays;

  let tabs: ShareLinkTab[] | undefined;
  if (Array.isArray(req.body?.tabs)) {
    tabs = req.body.tabs.filter((t: unknown): t is ShareLinkTab =>
      typeof t === "string" && ALL_SHARE_TABS.includes(t as ShareLinkTab),
    );
  }

  const link = createProjectShareLink(req.user!.uid, req.user!.email ?? "", projectId, {
    label,
    expiryDays,
    tabs,
  });
  res.status(201).json(link);
}

export async function revokeProjectShareLinkHandler(req: AuthenticatedRequest, res: Response) {
  const projectId = req.params.id as string;
  const linkId = req.params.linkId as string;
  const link = revokeProjectShareLink(req.user!.uid, req.user!.email ?? "", projectId, linkId);
  res.status(200).json(link);
}
