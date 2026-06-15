import { API_BASE_URL, apiFetchDefaults, parseJsonOrThrow, extractApiMessage } from "./core";
import type { ProjectSteeringSnapshot } from "@/lib/projectSteering";

export type ShareLinkExpiryDays = 7 | 30 | 90 | null;
export type ShareLinkTab = "pilotage" | "kanban" | "gantt";

export const ALL_SHARE_TABS: ShareLinkTab[] = ["pilotage", "kanban", "gantt"];

export interface ProjectShareLink {
  id: string;
  token: string;
  projectId: string;
  createdByUid: string;
  label: string | null;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastAccessedAt: string | null;
  allowedTabs?: ShareLinkTab[];
}

export interface SharedProjectTaskRow {
  id: string;
  title: string;
  status: string;
  phaseId: string | null;
  phaseName: string;
  startDate: string | null;
  deadline: string | null;
  priority: string;
  effort?: string;
  sortOrder: number;
  isBlocked: boolean;
  blockedByTodoIds?: string[];
}

export interface SharedProjectMilestoneRow {
  id: string;
  title: string;
  date: string;
  phaseId: string | null;
  color: string;
  order: number;
}

export interface SharedProjectView {
  projectName: string;
  projectDescription: string;
  phases: Array<{
    id: string;
    name: string;
    color: string;
    startDate: string | null;
    endDate: string | null;
    order: number;
  }>;
  milestones?: SharedProjectMilestoneRow[];
  steering: ProjectSteeringSnapshot;
  tasks: SharedProjectTaskRow[];
  sharedAt: string;
  expiresAt: string | null;
  allowedTabs: ShareLinkTab[];
}

export async function getSharedProjectView(token: string): Promise<SharedProjectView> {
  const res = await fetch(`${API_BASE_URL}/share/project/${encodeURIComponent(token)}`, {
    method: "GET",
    credentials: "omit",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Lien invalide ou expiré"));
  }
  return res.json() as Promise<SharedProjectView>;
}

export async function listProjectShareLinks(projectId: string): Promise<ProjectShareLink[]> {
  const res = await fetch(`${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/share-links`, {
    ...apiFetchDefaults,
    method: "GET",
  });
  if (!res.ok) throw new Error("Impossible de charger les liens");
  const data = (await res.json()) as { links: ProjectShareLink[] };
  return data.links;
}

export async function createProjectShareLink(
  projectId: string,
  options?: { label?: string; expiryDays?: ShareLinkExpiryDays; tabs?: ShareLinkTab[] },
): Promise<ProjectShareLink> {
  const res = await fetch(`${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/share-links`, {
    ...apiFetchDefaults,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options ?? {}),
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Impossible de créer le lien"));
  }
  return res.json() as Promise<ProjectShareLink>;
}

export async function revokeProjectShareLink(projectId: string, linkId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/share-links/${encodeURIComponent(linkId)}`,
    { ...apiFetchDefaults, method: "DELETE" },
  );
  if (!res.ok) throw new Error("Impossible de révoquer le lien");
}

export function buildShareProjectUrl(token: string): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/share/project/${token}`;
  }
  return `/share/project/${token}`;
}
