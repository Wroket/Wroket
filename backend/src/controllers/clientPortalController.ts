import { Response } from "express";
import rateLimit from "express-rate-limit";

import { AuthenticatedRequest } from "./authController";
import {
  createClientPortal,
  getClientPortalHubView,
  getClientPortalProjectView,
  listClientPortalsForOwner,
  revokeClientPortal,
  updateClientPortal,
  type ClientPortalBranding,
  type ClientPortalPrivacy,
} from "../services/clientPortalService";
import type { ShareLinkExpiryDays } from "../services/projectShareLinkService";

export const publicPortalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de requêtes — réessayez dans une minute", code: "PORTAL_RATE_LIMIT" },
});

export async function getPublicPortalHub(req: AuthenticatedRequest, res: Response) {
  const token = req.params.token as string;
  const view = await getClientPortalHubView(token);
  res.status(200).json(view);
}

export async function getPublicPortalProject(req: AuthenticatedRequest, res: Response) {
  const portalToken = req.params.token as string;
  const projectLinkToken = req.params.projectToken as string;
  const view = await getClientPortalProjectView(portalToken, projectLinkToken);
  res.status(200).json(view);
}

export async function listMyPortals(req: AuthenticatedRequest, res: Response) {
  const portals = listClientPortalsForOwner(req.user!.uid);
  res.status(200).json({ portals });
}

export async function createPortalHandler(req: AuthenticatedRequest, res: Response) {
  const label = typeof req.body?.label === "string" ? req.body.label : null;
  const rawDays = req.body?.expiryDays;
  let expiryDays: ShareLinkExpiryDays = 30;
  if (rawDays === null || rawDays === "never") expiryDays = null;
  else if (rawDays === 7 || rawDays === 30 || rawDays === 90) expiryDays = rawDays;

  const projectIds = Array.isArray(req.body?.projectIds)
    ? req.body.projectIds.filter((id: unknown): id is string => typeof id === "string")
    : undefined;
  const projectLinkTokens = Array.isArray(req.body?.projectLinkTokens)
    ? req.body.projectLinkTokens.filter((id: unknown): id is string => typeof id === "string")
    : undefined;

  const branding = req.body?.branding as Partial<ClientPortalBranding> | undefined;
  const privacy = req.body?.privacy as Partial<ClientPortalPrivacy> | undefined;
  const guestEmails = Array.isArray(req.body?.guestEmails)
    ? req.body.guestEmails.filter((e: unknown): e is string => typeof e === "string")
    : undefined;

  const portal = createClientPortal(req.user!.uid, req.user!.email ?? "", {
    label,
    expiryDays,
    projectIds,
    projectLinkTokens,
    branding,
    privacy,
    guestEmails,
  });
  res.status(201).json(portal);
}

export async function updatePortalHandler(req: AuthenticatedRequest, res: Response) {
  const portalId = req.params.id as string;
  const portal = updateClientPortal(req.user!.uid, portalId, {
    label: req.body?.label,
    projectLinkTokens: req.body?.projectLinkTokens,
    branding: req.body?.branding,
    privacy: req.body?.privacy,
    guestEmails: req.body?.guestEmails,
  });
  res.status(200).json(portal);
}

export async function revokePortalHandler(req: AuthenticatedRequest, res: Response) {
  const portalId = req.params.id as string;
  const portal = revokeClientPortal(req.user!.uid, portalId);
  res.status(200).json(portal);
}
