import type { AuthMeResponse, FreeQuotaSnapshot } from "@/lib/api/core";
import type { Project } from "@/lib/api/projects";

export function getFreeQuotas(user: AuthMeResponse | null): FreeQuotaSnapshot | null {
  return user?.freeQuotas ?? null;
}

/** True when creating another active task in the personal workspace would exceed the Free cap. */
export function personalTaskCreateBlocked(
  user: AuthMeResponse | null,
  projectId: string | null,
  projects: Project[],
): boolean {
  const q = getFreeQuotas(user);
  if (!q) return false;
  if (!countsTowardPersonalTaskQuota(projectId, projects)) return false;
  return q.activeTasksPersonal >= q.maxActiveTasksPersonal;
}

export function countsTowardPersonalTaskQuota(projectId: string | null, projects: Project[]): boolean {
  if (!projectId) return true;
  const p = projects.find((x) => x.id === projectId);
  if (!p) return true;
  return !p.teamId;
}

export function personalProjectsCreateBlocked(user: AuthMeResponse | null): boolean {
  const q = getFreeQuotas(user);
  if (!q) return false;
  return q.activeProjectsPersonal >= q.maxProjectsPersonal;
}

export function personalNotesCreateBlocked(user: AuthMeResponse | null): boolean {
  const q = getFreeQuotas(user);
  if (!q) return false;
  return q.notesCount >= q.maxNotes;
}

export function fillQuotaTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}
