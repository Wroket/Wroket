import { describe, expect, it } from "vitest";

import { agendaDragPointerMove, type AgendaDragSession } from "./agendaDrag";

describe("agendaDragPointerMove", () => {
  it("requires 8px movement before dragging", () => {
    const session: AgendaDragSession = {
      kind: "book",
      todoId: "t1",
      label: "Task",
      durationMs: 30 * 60_000,
      startX: 100,
      startY: 200,
      pointerId: 1,
      dragging: false,
    };
    expect(agendaDragPointerMove(session, 105, 203)).toBe(false);
    expect(session.dragging).toBe(false);
    expect(agendaDragPointerMove(session, 110, 210)).toBe(true);
    expect(session.dragging).toBe(true);
  });
});
