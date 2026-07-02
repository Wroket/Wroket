import { shouldApplyFreeTierVolumeQuotas } from "./authService";
import {
  FREE_TIER_MAX_ACTIVE_TASKS_PERSONAL,
  FREE_QUOTA_CODE_TASKS,
} from "./freeTierQuotaConstants";
import { addPhase, getProjectById } from "./projectService";
import { countPersonalActiveTodosForQuota, createTodo } from "./todoService";
import { PaymentRequiredError } from "../utils/errors";

export interface SeedTemplateSubtaskInput {
  title: string;
}

export interface SeedTemplateTaskInput {
  title: string;
  subtasks: SeedTemplateSubtaskInput[];
}

export interface SeedTemplatePhaseInput {
  name: string;
  tasks: SeedTemplateTaskInput[];
}

export interface SeedTemplateError {
  phaseIndex: number;
  taskIndex?: number;
  subtaskIndex?: number;
  message: string;
}

export interface SeedTemplateResult {
  phasesCreated: number;
  phasesTotal: number;
  todosCreated: number;
  todosTotal: number;
  errors: SeedTemplateError[];
}

/** Count active todos that would be created from a template payload. */
export function countSeedTemplateTodos(phases: SeedTemplatePhaseInput[]): number {
  let n = 0;
  for (const phase of phases) {
    for (const task of phase.tasks) {
      n += 1 + task.subtasks.length;
    }
  }
  return n;
}

async function assertPersonalQuotaForSeed(uid: string, projectId: string, needed: number): Promise<void> {
  if (!shouldApplyFreeTierVolumeQuotas(uid)) return;
  const project = getProjectById(projectId);
  if (project?.teamId) return;

  const current = await countPersonalActiveTodosForQuota(uid);
  if (current + needed > FREE_TIER_MAX_ACTIVE_TASKS_PERSONAL) {
    throw new PaymentRequiredError(
      `Le palier gratuit est limité à ${FREE_TIER_MAX_ACTIVE_TASKS_PERSONAL} tâches actives hors projets d'équipe. Ce template nécessite ${needed} tâches. Passez à un palier payant pour lever cette limite.`,
      FREE_QUOTA_CODE_TASKS,
    );
  }
}

function validatePhases(phases: unknown): SeedTemplatePhaseInput[] {
  if (!Array.isArray(phases) || phases.length === 0) {
    throw new Error("phases requis (tableau non vide)");
  }
  const out: SeedTemplatePhaseInput[] = [];
  for (const raw of phases) {
    if (!raw || typeof raw !== "object") throw new Error("phase invalide");
    const p = raw as Record<string, unknown>;
    if (typeof p.name !== "string" || !p.name.trim()) throw new Error("phase.name requis");
    if (!Array.isArray(p.tasks)) throw new Error("phase.tasks requis");
    const tasks: SeedTemplateTaskInput[] = [];
    for (const rawTask of p.tasks) {
      if (!rawTask || typeof rawTask !== "object") throw new Error("task invalide");
      const t = rawTask as Record<string, unknown>;
      if (typeof t.title !== "string" || !t.title.trim()) throw new Error("task.title requis");
      const subtasks: SeedTemplateSubtaskInput[] = [];
      if (Array.isArray(t.subtasks)) {
        for (const rawSub of t.subtasks) {
          if (!rawSub || typeof rawSub !== "object") throw new Error("subtask invalide");
          const s = rawSub as Record<string, unknown>;
          if (typeof s.title !== "string" || !s.title.trim()) throw new Error("subtask.title requis");
          subtasks.push({ title: s.title.trim() });
        }
      }
      tasks.push({ title: t.title.trim(), subtasks });
    }
    out.push({ name: p.name.trim(), tasks });
  }
  return out;
}

/**
 * Create phases and todos for a project from a localized template payload.
 * Best-effort per phase/task; collects errors instead of failing silently.
 */
export async function seedProjectTemplate(
  uid: string,
  email: string,
  projectId: string,
  phasesInput: unknown,
): Promise<SeedTemplateResult> {
  const phases = validatePhases(phasesInput);
  const todosTotal = countSeedTemplateTodos(phases);
  await assertPersonalQuotaForSeed(uid, projectId, todosTotal);

  const result: SeedTemplateResult = {
    phasesCreated: 0,
    phasesTotal: phases.length,
    todosCreated: 0,
    todosTotal,
    errors: [],
  };

  for (const [phaseIndex, phaseDef] of phases.entries()) {
    let phaseId: string;
    try {
      const phase = addPhase(projectId, { name: phaseDef.name, startDate: null, endDate: null });
      phaseId = phase.id;
      result.phasesCreated += 1;
    } catch (err) {
      result.errors.push({
        phaseIndex,
        message: err instanceof Error ? err.message : "Impossible de créer la phase",
      });
      continue;
    }

    for (const [taskIndex, taskDef] of phaseDef.tasks.entries()) {
      let parentId: string;
      try {
        const parentTodo = await createTodo(uid, email, {
          title: taskDef.title,
          priority: "medium",
          projectId,
          phaseId,
          sortOrder: (taskIndex + 1) * 100,
        });
        parentId = parentTodo.id;
        result.todosCreated += 1;
      } catch (err) {
        result.errors.push({
          phaseIndex,
          taskIndex,
          message: err instanceof Error ? err.message : "Impossible de créer la tâche",
        });
        continue;
      }

      for (const [subIndex, subDef] of taskDef.subtasks.entries()) {
        try {
          await createTodo(uid, email, {
            title: subDef.title,
            priority: "medium",
            projectId,
            phaseId,
            parentId,
            sortOrder: (taskIndex + 1) * 100 + (subIndex + 1),
          });
          result.todosCreated += 1;
        } catch (err) {
          result.errors.push({
            phaseIndex,
            taskIndex,
            subtaskIndex: subIndex,
            message: err instanceof Error ? err.message : "Impossible de créer la sous-tâche",
          });
        }
      }
    }
  }

  return result;
}
