import { describe, expect, it } from "vitest";

import {
  DEFAULT_VISIBLE_ACTIONS,
  sanitizeVisibleActions,
  TASK_LIST_ACTION_IDS,
} from "./taskListVisibleActions";

describe("sanitizeVisibleActions", () => {
  it("returns empty when nothing selected", () => {
    expect(sanitizeVisibleActions([])).toEqual([]);
    expect(sanitizeVisibleActions(null)).toEqual([]);
    expect(sanitizeVisibleActions("nope")).toEqual([]);
  });

  it("keeps known ids in canonical order and drops junk", () => {
    expect(
      sanitizeVisibleActions(["delete", "schedule", "delete", "unknown", "meet"]),
    ).toEqual(["schedule", "meet", "delete"]);
  });

  it("defaults cover the previous toolbar pins", () => {
    expect(DEFAULT_VISIBLE_ACTIONS).toEqual(["schedule", "meet", "comment"]);
    for (const id of DEFAULT_VISIBLE_ACTIONS) {
      expect(TASK_LIST_ACTION_IDS).toContain(id);
    }
  });
});
