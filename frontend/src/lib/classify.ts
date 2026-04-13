import type { Todo } from "./api";
import type { EisenhowerQuadrant } from "./taskScores";
import { computeTaskScores } from "./taskScores";

export type { EisenhowerQuadrant } from "./taskScores";

/**
 * Eisenhower quadrant derived from continuous scores (urgency, importance, load)
 * — see `computeTaskScores` in `./taskScores`.
 */
export function classify(todo: Todo): EisenhowerQuadrant {
  return computeTaskScores(todo).quadrant;
}
