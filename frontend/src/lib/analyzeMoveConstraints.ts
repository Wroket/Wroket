import type { Project, Todo } from "@/lib/api";
import { getPhaseSlotDateBounds, isSlotWithinPhaseLocalDays } from "@/lib/phaseSlotBounds";

export type MoveConstraintIssue =
  | { kind: "date"; phaseStart: string | null; phaseEnd: string | null }
  | { kind: "slot"; phaseStart: string | null; phaseEnd: string | null };

/** Client-side pre-check before calling moveTodo (mirrors server phase window). */
export function analyzeMoveConstraints(
  todo: Todo,
  targetPhaseId: string | null,
  projects: Project[],
): MoveConstraintIssue[] {
  const issues: MoveConstraintIssue[] = [];
  const pseudoTodo = { ...todo, phaseId: targetPhaseId };
  const bounds = getPhaseSlotDateBounds(pseudoTodo, projects);

  const phaseStart = bounds.min ?? null;
  const phaseEnd = bounds.max ?? null;

  if (phaseStart || phaseEnd) {
    const startBad = todo.startDate && phaseStart && todo.startDate < phaseStart;
    const endBad = todo.deadline && phaseEnd && todo.deadline > phaseEnd;
    const deadlineBefore = todo.deadline && phaseStart && todo.deadline < phaseStart;
    if (startBad || endBad || deadlineBefore) {
      issues.push({ kind: "date", phaseStart, phaseEnd });
    }
  }

  if (todo.scheduledSlot && (phaseStart || phaseEnd)) {
    const startMs = new Date(todo.scheduledSlot.start).getTime();
    const endMs = new Date(todo.scheduledSlot.end).getTime();
    if (!isSlotWithinPhaseLocalDays(bounds, startMs, endMs)) {
      issues.push({ kind: "slot", phaseStart, phaseEnd });
    }
  }

  return issues;
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}
