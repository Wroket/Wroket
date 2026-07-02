import type { AuthMeResponse, FreeQuotaSnapshot } from "@/lib/api/core";
import type { Project } from "@/lib/api/projects";
import type { ProjectTemplate } from "@/app/projects/_components/types";
import { getProjectTemplateStats } from "@/app/projects/_components/types";
import type { TranslationKey } from "@/lib/i18n";

/** Mirrors backend FREE_TIER_MAX_ACTIVE_TASKS_PERSONAL. */
export const FREE_TIER_MAX_ACTIVE_TASKS_PERSONAL = 25;

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

/** True when seeding a template on a personal project would exceed the Free task cap. */
export function personalTemplateSeedBlocked(
  user: AuthMeResponse | null,
  teamId: string | null,
  todosNeeded: number,
): boolean {
  const q = getFreeQuotas(user);
  if (!q) return false;
  if (teamId) return false;
  return q.activeTasksPersonal + todosNeeded > q.maxActiveTasksPersonal;
}

export function personalNotesCreateBlocked(user: AuthMeResponse | null): boolean {
  const q = getFreeQuotas(user);
  if (!q) return false;
  return q.notesCount >= q.maxNotes;
}

export function fillQuotaTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}

export type TemplateLockReason = "none" | "plan" | "headroom";

export interface ProjectTemplateAvailability {
  selectable: boolean;
  lockReason: TemplateLockReason;
  tooltipKey: TranslationKey;
  requiredPlan: "first" | "small" | "large";
}

/** Whether a project template can be selected for the current user and project context. */
export function getProjectTemplateAvailability(
  template: ProjectTemplate,
  user: AuthMeResponse | null,
  teamId: string | null,
): ProjectTemplateAvailability {
  const requiredPlan = template.minBillingPlan ?? "first";
  const unlocked: ProjectTemplateAvailability = {
    selectable: true,
    lockReason: "none",
    tooltipKey: "projects.templateLockedPlan",
    requiredPlan,
  };

  if (user?.earlyBird || !getFreeQuotas(user)) return unlocked;
  if (teamId) return unlocked;

  if (!template.freeTier) {
    return {
      ...unlocked,
      selectable: false,
      lockReason: "plan",
    };
  }

  const q = getFreeQuotas(user)!;
  const stats = getProjectTemplateStats(template);
  if (q.activeTasksPersonal + stats.totalTodos > q.maxActiveTasksPersonal) {
    return {
      ...unlocked,
      selectable: false,
      lockReason: "headroom",
      tooltipKey: "projects.templateLockedHeadroom",
    };
  }

  return unlocked;
}

/** First selectable template id for the user context, or null. */
export function firstSelectableTemplateId(
  templates: ProjectTemplate[],
  user: AuthMeResponse | null,
  teamId: string | null,
): string | null {
  const found = templates.find((tpl) => getProjectTemplateAvailability(tpl, user, teamId).selectable);
  return found?.id ?? null;
}
