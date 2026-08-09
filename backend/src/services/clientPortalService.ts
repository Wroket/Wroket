import crypto from "crypto";

import { getStore, scheduleSave } from "../persistence";
import { ForbiddenError, NotFoundError, PaymentRequiredError, ValidationError } from "../utils/errors";
import { getEntitlementsForUid } from "./authService";
import { canEditProject, getProjectById } from "./projectService";
import {
  ALL_SHARE_TABS,
  getSharedProjectView,
  type ShareLinkExpiryDays,
  type ShareLinkTab,
  type SharedProjectView,
} from "./projectShareLinkService";
import { createProjectShareLink, listShareLinksForProject, resolveShareLink } from "./projectShareLinkService";

export interface ClientPortalPrivacy {
  showTasks: boolean;
  showAssignees: boolean;
  showComments: boolean;
  showAttachments: boolean;
}

export interface ClientPortalBranding {
  displayName: string | null;
  logoUrl: string | null;
  accentColor: string | null;
}

export interface ClientPortal {
  id: string;
  token: string;
  ownerUid: string;
  label: string | null;
  /** Active project share link tokens included in this hub. */
  projectLinkTokens: string[];
  branding: ClientPortalBranding;
  privacy: ClientPortalPrivacy;
  /** Optional guest emails allowed when mode is invite (soft allow-list; token still required). */
  guestEmails: string[];
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastAccessedAt: string | null;
}

export interface ClientPortalHubProjectCard {
  token: string;
  projectName: string;
  projectDescription: string;
  healthLabel: string;
  taskCount: number;
  allowedTabs: ShareLinkTab[];
}

export interface ClientPortalHubView {
  label: string | null;
  branding: ClientPortalBranding;
  privacy: ClientPortalPrivacy;
  projects: ClientPortalHubProjectCard[];
  expiresAt: string | null;
  sharedAt: string;
}

const portalsByToken = new Map<string, ClientPortal>();

const DEFAULT_PRIVACY: ClientPortalPrivacy = {
  showTasks: true,
  showAssignees: false,
  showComments: false,
  showAttachments: false,
};

const DEFAULT_BRANDING: ClientPortalBranding = {
  displayName: null,
  logoUrl: null,
  accentColor: null,
};

function hydrate(): void {
  portalsByToken.clear();
  const raw = getStore().clientPortals;
  if (!raw || typeof raw !== "object") return;
  for (const [token, row] of Object.entries(raw)) {
    const portal = row as ClientPortal;
    if (portal?.token) portalsByToken.set(portal.token, portal);
    else portalsByToken.set(token, { ...portal, token });
  }
}

if (getStore().clientPortals) {
  hydrate();
}

function persist(): void {
  const obj: Record<string, ClientPortal> = {};
  portalsByToken.forEach((p) => {
    obj[p.token] = p;
  });
  getStore().clientPortals = obj;
  scheduleSave("clientPortals");
}

function newToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

function expiryFromDays(days: ShareLinkExpiryDays): string | null {
  if (days === null) return null;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function isActive(portal: ClientPortal, now = new Date()): boolean {
  if (portal.revokedAt) return false;
  if (portal.expiresAt && new Date(portal.expiresAt) < now) return false;
  return true;
}

export function assertClientPortalEntitlement(uid: string): void {
  // Local smoke / CI: unlock without Stripe (prod never sets USE_LOCAL_STORE).
  if (
    process.env.USE_LOCAL_STORE === "true" &&
    (process.env.E2E_UNLOCK_PREMIUM === "true" || process.env.CI === "true")
  ) {
    return;
  }
  if (!getEntitlementsForUid(uid).clientPortal) {
    throw new PaymentRequiredError(
      "Le Client Portal nécessite le palier Large teams (ou Early Bird).",
      "CLIENT_PORTAL_PLAN_REQUIRED",
    );
  }
}

export function reloadClientPortalsFromStore(): void {
  hydrate();
}

export function listClientPortalsForOwner(uid: string): ClientPortal[] {
  return [...portalsByToken.values()]
    .filter((p) => p.ownerUid === uid)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Hard-delete portals owned by uid (RGPD). */
export function purgeClientPortalsForOwner(uid: string): number {
  let n = 0;
  for (const [token, p] of [...portalsByToken.entries()]) {
    if (p.ownerUid === uid) {
      portalsByToken.delete(token);
      n++;
    }
  }
  if (n > 0) persist();
  return n;
}

export function createClientPortal(
  uid: string,
  userEmail: string,
  options?: {
    label?: string | null;
    expiryDays?: ShareLinkExpiryDays;
    projectLinkTokens?: string[];
    projectIds?: string[];
    branding?: Partial<ClientPortalBranding>;
    privacy?: Partial<ClientPortalPrivacy>;
    guestEmails?: string[];
  },
): ClientPortal {
  assertClientPortalEntitlement(uid);
  let tokens = [...new Set((options?.projectLinkTokens ?? []).map((t) => t.trim()).filter(Boolean))];
  if (tokens.length === 0 && options?.projectIds?.length) {
    tokens = options.projectIds.map((pid) => ensureProjectShareTokenForPortal(uid, userEmail, pid));
  }
  if (tokens.length === 0) {
    throw new ValidationError("Ajoutez au moins un projet au portail", "PORTAL_PROJECTS_REQUIRED");
  }
  for (const t of tokens) {
    const link = resolveShareLink(t);
    if (!link) throw new ValidationError("Lien projet invalide ou expiré", "PORTAL_PROJECT_LINK_INVALID");
    const project = getProjectById(link.projectId);
    if (!project || !canEditProject(uid, userEmail, project)) {
      throw new ForbiddenError("Vous devez administrer chaque projet inclus");
    }
  }

  const now = new Date().toISOString();
  const portal: ClientPortal = {
    id: crypto.randomUUID(),
    token: newToken(),
    ownerUid: uid,
    label: options?.label?.trim() || null,
    projectLinkTokens: tokens,
    branding: {
      displayName: options?.branding?.displayName?.trim() || null,
      logoUrl: options?.branding?.logoUrl?.trim() || null,
      accentColor: options?.branding?.accentColor?.trim() || null,
    },
    privacy: { ...DEFAULT_PRIVACY, ...options?.privacy },
    guestEmails: (options?.guestEmails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean),
    createdAt: now,
    expiresAt: expiryFromDays(options?.expiryDays ?? 30),
    revokedAt: null,
    lastAccessedAt: null,
  };
  portalsByToken.set(portal.token, portal);
  persist();
  return portal;
}

export function updateClientPortal(
  uid: string,
  portalId: string,
  patch: {
    label?: string | null;
    projectLinkTokens?: string[];
    branding?: Partial<ClientPortalBranding>;
    privacy?: Partial<ClientPortalPrivacy>;
    guestEmails?: string[];
  },
): ClientPortal {
  assertClientPortalEntitlement(uid);
  const portal = [...portalsByToken.values()].find((p) => p.id === portalId && p.ownerUid === uid);
  if (!portal) throw new NotFoundError("Portail introuvable");
  if (patch.label !== undefined) portal.label = patch.label?.trim() || null;
  if (patch.projectLinkTokens) {
    const tokens = [...new Set(patch.projectLinkTokens.map((t) => t.trim()).filter(Boolean))];
    if (tokens.length === 0) {
      throw new ValidationError("Ajoutez au moins un lien projet au portail", "PORTAL_PROJECTS_REQUIRED");
    }
    portal.projectLinkTokens = tokens;
  }
  if (patch.branding) {
    portal.branding = {
      displayName: patch.branding.displayName !== undefined
        ? patch.branding.displayName?.trim() || null
        : portal.branding.displayName,
      logoUrl: patch.branding.logoUrl !== undefined
        ? patch.branding.logoUrl?.trim() || null
        : portal.branding.logoUrl,
      accentColor: patch.branding.accentColor !== undefined
        ? patch.branding.accentColor?.trim() || null
        : portal.branding.accentColor,
    };
  }
  if (patch.privacy) portal.privacy = { ...portal.privacy, ...patch.privacy };
  if (patch.guestEmails) {
    portal.guestEmails = patch.guestEmails.map((e) => e.trim().toLowerCase()).filter(Boolean);
  }
  portalsByToken.set(portal.token, portal);
  persist();
  return portal;
}

export function revokeClientPortal(uid: string, portalId: string): ClientPortal {
  assertClientPortalEntitlement(uid);
  const portal = [...portalsByToken.values()].find((p) => p.id === portalId && p.ownerUid === uid);
  if (!portal) throw new NotFoundError("Portail introuvable");
  portal.revokedAt = new Date().toISOString();
  portalsByToken.set(portal.token, portal);
  persist();
  return portal;
}

function applyPrivacy(view: SharedProjectView, privacy: ClientPortalPrivacy): SharedProjectView {
  if (!privacy.showTasks) {
    return { ...view, tasks: [] };
  }
  return view;
}

export async function getClientPortalHubView(token: string): Promise<ClientPortalHubView> {
  const portal = portalsByToken.get(token);
  if (!portal || !isActive(portal)) {
    throw new NotFoundError("Portail expiré ou révoqué", "PORTAL_INVALID");
  }

  const projects: ClientPortalHubProjectCard[] = [];
  for (const linkToken of portal.projectLinkTokens) {
    try {
      const view = applyPrivacy(await getSharedProjectView(linkToken), portal.privacy);
      projects.push({
        token: linkToken,
        projectName: view.projectName,
        projectDescription: view.projectDescription,
        healthLabel: String(view.steering.health ?? "—"),
        taskCount: view.tasks.length,
        allowedTabs: view.allowedTabs?.length ? view.allowedTabs : [...ALL_SHARE_TABS],
      });
    } catch {
      /* skip dead links */
    }
  }

  portal.lastAccessedAt = new Date().toISOString();
  portalsByToken.set(portal.token, portal);
  persist();

  return {
    label: portal.label,
    branding: portal.branding.displayName || portal.branding.logoUrl ? portal.branding : DEFAULT_BRANDING,
    privacy: portal.privacy,
    projects,
    expiresAt: portal.expiresAt,
    sharedAt: portal.createdAt,
  };
}

export async function getClientPortalProjectView(
  portalToken: string,
  projectLinkToken: string,
): Promise<SharedProjectView & { branding: ClientPortalBranding; privacy: ClientPortalPrivacy }> {
  const portal = portalsByToken.get(portalToken);
  if (!portal || !isActive(portal)) {
    throw new NotFoundError("Portail expiré ou révoqué", "PORTAL_INVALID");
  }
  if (!portal.projectLinkTokens.includes(projectLinkToken)) {
    throw new NotFoundError("Projet hors de ce portail", "PORTAL_PROJECT_NOT_IN_HUB");
  }
  const view = applyPrivacy(await getSharedProjectView(projectLinkToken), portal.privacy);
  return { ...view, branding: portal.branding, privacy: portal.privacy };
}

/** Helper for owners: ensure a share link exists for project and return token. */
export function ensureProjectShareTokenForPortal(
  uid: string,
  userEmail: string,
  projectId: string,
): string {
  const active = listShareLinksForProject(projectId).filter((l) => !l.revokedAt);
  if (active.length > 0) return active[0].token;
  return createProjectShareLink(uid, userEmail, projectId, {
    label: "Portal",
    expiryDays: 90,
    tabs: [...ALL_SHARE_TABS],
  }).token;
}
