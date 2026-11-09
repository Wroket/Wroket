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
  /** Days from today for task deadline (optional; defaults from phase end). */
  deadlineOffsetDays?: number;
}

export interface SeedTemplatePhaseInput {
  name: string;
  tasks: SeedTemplateTaskInput[];
  /** Days from today for phase start (optional). */
  startOffsetDays?: number;
  /** Days from today for phase end (optional). */
  endOffsetDays?: number;
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

const PHASE_SPAN_DAYS = 14;

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

/**
 * YYYY-MM-DD for local calendar day offset from a reference date.
 */
export function dateOffsetIso(base: Date, offsetDays: number): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
      const deadlineOffsetDays =
        typeof t.deadlineOffsetDays === "number" && Number.isFinite(t.deadlineOffsetDays)
          ? Math.floor(t.deadlineOffsetDays)
          : undefined;
      tasks.push({ title: t.title.trim(), subtasks, deadlineOffsetDays });
    }
    const startOffsetDays =
      typeof p.startOffsetDays === "number" && Number.isFinite(p.startOffsetDays)
        ? Math.floor(p.startOffsetDays)
        : undefined;
    const endOffsetDays =
      typeof p.endOffsetDays === "number" && Number.isFinite(p.endOffsetDays)
        ? Math.floor(p.endOffsetDays)
        : undefined;
    out.push({ name: p.name.trim(), tasks, startOffsetDays, endOffsetDays });
  }
  return out;
}

/**
 * Create phases and todos for a project from a localized template payload.
 * Best-effort per phase/task; collects errors instead of failing silently.
 * Assigns relative phase/task dates so steering/Gantt are usable out of the box.
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

  const today = new Date();

  for (const [phaseIndex, phaseDef] of phases.entries()) {
    // Phase 0 starts a week ago so one overdue demo task stays inside phase bounds.
    const startOff =
      phaseDef.startOffsetDays ?? (phaseIndex === 0 ? -7 : phaseIndex * PHASE_SPAN_DAYS);
    const endOff = phaseDef.endOffsetDays ?? startOff + PHASE_SPAN_DAYS - 1;
    const startDate = dateOffsetIso(today, startOff);
    const endDate = dateOffsetIso(today, Math.max(endOff, startOff));

    let phaseId: string;
    try {
      const phase = addPhase(projectId, { name: phaseDef.name, startDate, endDate });
      phaseId = phase.id;
      result.phasesCreated += 1;
    } catch (err) {
      result.errors.push({
        phaseIndex,
        message: err instanceof Error ? err.message : "Impossible de créer la phase",
      });
      continue;
    }

    // Phase endDate is enough for Pilotage/Gantt — do not seed a duplicate milestone.

    for (const [taskIndex, taskDef] of phaseDef.tasks.entries()) {
      const taskOffset =
        taskDef.deadlineOffsetDays ??
        startOff + Math.min(PHASE_SPAN_DAYS - 1, Math.floor(((taskIndex + 1) * PHASE_SPAN_DAYS) / Math.max(phaseDef.tasks.length, 1)));
      // First root task of first phase: one overdue demo task (why-late / B2 smoke).
      const overdueDemo = phaseIndex === 0 && taskIndex === 0;
      // Second root task of first phase: due within 3 days (Pilotage « bientôt dû »).
      const comingDueDemo = phaseIndex === 0 && taskIndex === 1;
      let deadlineDay = Math.min(Math.max(taskOffset, startOff), endOff);
      if (overdueDemo) deadlineDay = -1;
      else if (comingDueDemo) deadlineDay = Math.min(2, endOff);
      const deadline = dateOffsetIso(today, deadlineDay);

      let parentId: string;
      try {
        const parentTodo = await createTodo(uid, email, {
          title: taskDef.title,
          priority: "medium",
          projectId,
          phaseId,
          startDate: overdueDemo ? dateOffsetIso(today, -7) : startDate,
          deadline,
          sortOrder: (taskIndex + 1) * 100,
          allowPastDeadline: overdueDemo,
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
            startDate,
            deadline,
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
