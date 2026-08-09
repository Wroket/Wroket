import { API_BASE_URL, apiFetchDefaults, parseJsonOrThrow, extractApiMessage } from "./core";
import type { SharedProjectView, ShareLinkExpiryDays, ShareLinkTab } from "./projectShare";

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
  projectLinkTokens: string[];
  branding: ClientPortalBranding;
  privacy: ClientPortalPrivacy;
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

export type PortalProjectView = SharedProjectView & {
  branding: ClientPortalBranding;
  privacy: ClientPortalPrivacy;
};

export function buildPortalUrl(token: string): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/share/portal/${token}`;
  }
  return `/share/portal/${token}`;
}

export async function listClientPortals(): Promise<ClientPortal[]> {
  const res = await fetch(`${API_BASE_URL}/portals`, { ...apiFetchDefaults, method: "GET" });
  if (!res.ok) throw new Error("Impossible de charger les portails");
  const data = (await res.json()) as { portals: ClientPortal[] };
  return data.portals;
}

export async function createClientPortal(body: {
  label?: string | null;
  expiryDays?: ShareLinkExpiryDays;
  projectIds?: string[];
  projectLinkTokens?: string[];
  branding?: Partial<ClientPortalBranding>;
  privacy?: Partial<ClientPortalPrivacy>;
  guestEmails?: string[];
}): Promise<ClientPortal> {
  const res = await fetch(`${API_BASE_URL}/portals`, {
    ...apiFetchDefaults,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(err, "Impossible de créer le portail"));
  }
  return res.json() as Promise<ClientPortal>;
}

export async function revokeClientPortal(portalId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/portals/${encodeURIComponent(portalId)}`, {
    ...apiFetchDefaults,
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Impossible de révoquer le portail");
}

export async function getClientPortalHub(token: string): Promise<ClientPortalHubView> {
  const res = await fetch(`${API_BASE_URL}/share/portal/${encodeURIComponent(token)}`, {
    method: "GET",
    credentials: "omit",
  });
  if (!res.ok) {
    const err = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(err, "Portail invalide ou expiré"));
  }
  return res.json() as Promise<ClientPortalHubView>;
}

export async function getClientPortalProject(
  portalToken: string,
  projectLinkToken: string,
): Promise<PortalProjectView> {
  const res = await fetch(
    `${API_BASE_URL}/share/portal/${encodeURIComponent(portalToken)}/project/${encodeURIComponent(projectLinkToken)}`,
    { method: "GET", credentials: "omit" },
  );
  if (!res.ok) {
    const err = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(err, "Projet introuvable"));
  }
  return res.json() as Promise<PortalProjectView>;
}
