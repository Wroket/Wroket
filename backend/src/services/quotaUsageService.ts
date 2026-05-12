import { shouldApplyFreeTierVolumeQuotas } from "./authService";
import {
  FREE_TIER_MAX_ACTIVE_TASKS_PERSONAL,
  FREE_TIER_MAX_PERSONAL_NOTES,
  FREE_TIER_MAX_PERSONAL_PROJECTS,
} from "./freeTierQuotaConstants";
import { countPersonalNotesForQuota } from "./noteService";
import { countPersonalActiveProjectsForQuota } from "./projectService";
import { countPersonalActiveTodosForQuota } from "./todoService";

export interface FreeQuotaSnapshot {
  maxActiveTasksPersonal: number;
  activeTasksPersonal: number;
  maxProjectsPersonal: number;
  activeProjectsPersonal: number;
  maxNotes: number;
  notesCount: number;
}

/** Usage headroom for Free-tier users (null when quotas do not apply). */
export function getFreeQuotaSnapshot(uid: string): FreeQuotaSnapshot | null {
  if (!shouldApplyFreeTierVolumeQuotas(uid)) return null;
  return {
    maxActiveTasksPersonal: FREE_TIER_MAX_ACTIVE_TASKS_PERSONAL,
    activeTasksPersonal: countPersonalActiveTodosForQuota(uid),
    maxProjectsPersonal: FREE_TIER_MAX_PERSONAL_PROJECTS,
    activeProjectsPersonal: countPersonalActiveProjectsForQuota(uid),
    maxNotes: FREE_TIER_MAX_PERSONAL_NOTES,
    notesCount: countPersonalNotesForQuota(uid),
  };
}
