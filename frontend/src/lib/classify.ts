import type { Todo } from "./api";
import type { EisenhowerQuadrant } from "./taskScores";
import { computeTaskScores } from "./taskScores";

export type { EisenhowerQuadrant } from "./taskScores";

/**
 * Radar quadrant derived from continuous scores (urgency, importance, load)
 * — see `computeTaskScores` in `./taskScores`.
 *
 * Pass `nowMs` to use a shared timestamp (e.g. a ticker in the radar view)
 * so the quadrant stays consistent with the live score display.
 */
export function classify(todo: Todo, nowMs?: number): EisenhowerQuadrant {
  return computeTaskScores(todo, nowMs).quadrant;
}
