import type { MoveTodoPayload, MoveTodoStrategy, Todo } from "@/lib/api/todos";
import { moveTodoApi } from "@/lib/api/todos";
import type { Project } from "@/lib/api";
import { analyzeMoveConstraints } from "@/lib/analyzeMoveConstraints";
import type { TaskMoveModalState } from "@/app/projects/_components/TaskMoveConstraintModal";

export function computePhaseReorderIds(
  tasksByPhase: Map<string | "__none__", Todo[]>,
  targetPhaseKey: string,
  taskId: string,
  insertIndex: number,
): string[] {
  const ids = (tasksByPhase.get(targetPhaseKey) ?? [])
    .filter((td) => !td.parentId && td.id !== taskId)
    .map((t) => t.id);
  ids.splice(insertIndex, 0, taskId);
  return ids;
}

export interface ExecuteTaskMoveParams {
  taskId: string;
  payload: MoveTodoPayload;
  todo: Todo;
  projects: Project[];
  variant?: "light" | "dates";
  skipPrecheck?: boolean;
  onSuccess: (updated: Todo) => void;
  onError: (message: string) => void;
  setModal: (state: TaskMoveModalState | null) => void;
  retry: (taskId: string, payload: MoveTodoPayload, opts?: { skipPrecheck?: boolean }) => void;
}

export async function executeTaskMove({
  taskId,
  payload,
  todo,
  projects,
  variant = "light",
  skipPrecheck = false,
  onSuccess,
  onError,
  setModal,
  retry,
}: ExecuteTaskMoveParams): Promise<void> {
  if (!skipPrecheck && payload.phaseId !== undefined) {
    const issues = analyzeMoveConstraints(todo, payload.phaseId, projects);
    const dateIssue = issues.find((i) => i.kind === "date");
    const slotIssue = issues.find((i) => i.kind === "slot");
    if (dateIssue && (payload.strategy ?? "default") === "default") {
      setModal({
        variant,
        code: "TASK_PHASE_DATE_MISMATCH",
        phaseStart: dateIssue.phaseStart,
        phaseEnd: dateIssue.phaseEnd,
        onResolve: (strategy: MoveTodoStrategy) => {
          setModal(null);
          void retry(taskId, { ...payload, strategy }, { skipPrecheck: true });
        },
      });
      return;
    }
    if (slotIssue && (payload.strategy ?? "default") === "default") {
      setModal({
        variant,
        code: "TASK_PHASE_SLOT_MISMATCH",
        phaseStart: slotIssue.phaseStart,
        phaseEnd: slotIssue.phaseEnd,
        onResolve: (strategy: MoveTodoStrategy) => {
          setModal(null);
          void retry(taskId, { ...payload, strategy }, { skipPrecheck: true });
        },
      });
      return;
    }
  }

  try {
    const result = await moveTodoApi(taskId, payload);
    if (result.ok) {
      onSuccess(result.todo);
      setModal(null);
      return;
    }
    if (result.status === 422) {
      const code =
        result.code === "TASK_PHASE_SLOT_MISMATCH"
          ? "TASK_PHASE_SLOT_MISMATCH"
          : "TASK_PHASE_DATE_MISMATCH";
      const details = result.details ?? {};
      setModal({
        variant,
        code,
        phaseStart: (details.phaseStart as string | null) ?? (details.phaseEnd as string | null) ?? null,
        phaseEnd: (details.phaseEnd as string | null) ?? null,
        onResolve: (strategy: MoveTodoStrategy) => {
          setModal(null);
          void retry(taskId, { ...payload, strategy }, { skipPrecheck: true });
        },
      });
      return;
    }
    if (result.status === 409) {
      setModal({
        variant: "conflict",
        conflicts: result.conflicts,
        onResolve: (force: boolean) => {
          setModal(null);
          if (force) {
            void retry(
              taskId,
              { ...payload, forceCalendarConflict: true, strategy: payload.strategy ?? "rescheduleSlot" },
              { skipPrecheck: true },
            );
          }
        },
      });
      return;
    }
  } catch (err) {
    onError(err instanceof Error ? err.message : "Error");
  }
}
