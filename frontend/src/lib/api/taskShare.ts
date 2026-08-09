import { API_BASE_URL, apiFetchDefaults, parseJsonOrThrow, extractApiMessage } from "./core";
import type { ShareLinkExpiryDays } from "./projectShare";

export interface TaskShareLink {
  id: string;
  token: string;
  todoId: string;
  ownerUid: string;
  label: string | null;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastAccessedAt: string | null;
}

export interface SharedTaskView {
  title: string;
  status: string;
  priority: string;
  effort: string;
  startDate: string | null;
  deadline: string | null;
  phaseName: string | null;
  projectName: string | null;
  summary: string;
  tags: string[];
  sharedAt: string;
  expiresAt: string | null;
}

export function buildShareTaskUrl(token: string): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/share/task/${token}`;
  }
  return `/share/task/${token}`;
}

export async function listTaskShareLinks(todoId: string): Promise<TaskShareLink[]> {
  const res = await fetch(`${API_BASE_URL}/todos/${encodeURIComponent(todoId)}/share-links`, {
    ...apiFetchDefaults,
    method: "GET",
  });
  if (!res.ok) throw new Error("Impossible de charger les liens");
  const data = (await res.json()) as { links: TaskShareLink[] };
  return data.links;
}

export async function createTaskShareLink(
  todoId: string,
  body?: { label?: string | null; expiryDays?: ShareLinkExpiryDays },
): Promise<TaskShareLink> {
  const res = await fetch(`${API_BASE_URL}/todos/${encodeURIComponent(todoId)}/share-links`, {
    ...apiFetchDefaults,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const err = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(err, "Impossible de créer le lien"));
  }
  return res.json() as Promise<TaskShareLink>;
}

export async function revokeTaskShareLink(todoId: string, linkId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/todos/${encodeURIComponent(todoId)}/share-links/${encodeURIComponent(linkId)}`,
    { ...apiFetchDefaults, method: "DELETE" },
  );
  if (!res.ok) throw new Error("Impossible de révoquer");
}

export async function getSharedTask(token: string): Promise<SharedTaskView> {
  const res = await fetch(`${API_BASE_URL}/share/task/${encodeURIComponent(token)}`, {
    method: "GET",
    credentials: "omit",
  });
  if (!res.ok) {
    const err = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(err, "Lien invalide ou expiré"));
  }
  return res.json() as Promise<SharedTaskView>;
}
