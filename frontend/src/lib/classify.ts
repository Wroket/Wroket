import type { Todo } from "./api";

export type EisenhowerQuadrant = "do-first" | "schedule" | "delegate" | "eliminate";

const URGENCY_THRESHOLD_DAYS = 3;

/**
 * Eisenhower classification using 3 axes:
 *   - Deadline (urgency):   ≤1d very urgent, ≤3d soon, otherwise not urgent
 *   - Priority (importance): high/medium = important, low = not important
 *   - Effort (load):        light = quick win (promote), heavy = demote if not important
 */
export function classify(todo: Todo): EisenhowerQuadrant {
  const important = todo.priority === "high" || todo.priority === "medium";
  const eff = todo.effort ?? "medium";

  if (todo.deadline) {
    const daysLeft =
      (new Date(todo.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24);

    if (daysLeft <= 1) {
      if (!important && eff === "heavy") return "delegate";
      return "do-first";
    }

    if (daysLeft <= URGENCY_THRESHOLD_DAYS) {
      if (important) return "do-first";
      if (eff === "heavy") return "eliminate";
      return "delegate";
    }
  }

  if (important) return eff === "light" ? "do-first" : "schedule";
  return eff === "light" ? "delegate" : "eliminate";
}
