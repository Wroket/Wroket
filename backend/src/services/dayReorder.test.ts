import { describe, expect, it } from "vitest";

import type { WorkingHours } from "./authService";
import { planDayReorder, type DayReorderTask } from "./dayReorder";
import { tzLocalToUtc } from "./calendarService";

const WH: WorkingHours = {
  start: "09:00",
  end: "16:00",
  timezone: "Europe/Paris",
  daysOfWeek: [1, 2, 3, 4, 5],
};

function at(hour: number, minute = 0): Date {
  return tzLocalToUtc(2026, 10, 6, hour, minute, "Europe/Paris");
}

function task(partial: Partial<DayReorderTask> & Pick<DayReorderTask, "id" | "start" | "end">): DayReorderTask {
  return {
    title: partial.id,
    priority: "medium",
    deadlineCap: null,
    notBefore: null,
    meeting: false,
    calendarEventId: null,
    ...partial,
  };
}

describe("planDayReorder", () => {
  it("moves an eaten slot into the earliest free gap today", () => {
    const plan = planDayReorder({
      now: at(10),
      workingHours: WH,
      tasks: [task({ id: "a", start: at(14), end: at(15) })],
      external: [{ id: "g1", title: "Client", start: at(14), end: at(15) }],
    });
    expect(plan.date).toBe("2026-11-06");
    expect(plan.triggers.map((item) => item.title)).toEqual(["Client"]);
    expect(plan.moves).toHaveLength(1);
    expect(plan.moves[0]?.to?.start).toBe(at(10).toISOString());
    expect(plan.moves[0]?.to?.end).toBe(at(11).toISOString());
  });

  it("keeps a task that does not overlap the appointment", () => {
    const plan = planDayReorder({
      now: at(10),
      workingHours: WH,
      tasks: [
        task({ id: "morning", start: at(10), end: at(11) }),
        task({ id: "afternoon", start: at(14), end: at(15) }),
      ],
      external: [{ id: "g1", title: "Client", start: at(14), end: at(15) }],
    });
    expect(plan.moves.map((move) => move.todoId)).toEqual(["afternoon"]);
    expect(plan.moves[0]?.to?.start).toBe(at(11).toISOString());
  });

  it("gives the only remaining gap to the higher priority", () => {
    const plan = planDayReorder({
      now: at(9),
      workingHours: WH,
      tasks: [
        task({ id: "kept", start: at(9), end: at(14) }),
        task({ id: "low", priority: "low", start: at(14), end: at(15) }),
        task({ id: "high", priority: "high", start: at(14), end: at(15) }),
      ],
      external: [{ id: "g1", title: "Client", start: at(14), end: at(15) }],
    });
    const high = plan.moves.find((move) => move.todoId === "high");
    const low = plan.moves.find((move) => move.todoId === "low");
    expect(plan.moves.map((move) => move.todoId)).not.toContain("kept");
    expect(high?.to?.start).toBe(at(15).toISOString());
    expect(low?.to).toBeNull();
  });

  it("does not treat the task's own calendar event as an outside appointment", () => {
    const plan = planDayReorder({
      now: at(10),
      workingHours: WH,
      tasks: [task({ id: "a", start: at(14), end: at(15), calendarEventId: "g1" })],
      external: [{ id: "g1", title: "Déjà Wroket", start: at(14), end: at(15) }],
    });
    expect(plan.moves).toEqual([]);
  });

  it("leaves a finished slot alone", () => {
    const plan = planDayReorder({
      now: at(16),
      workingHours: WH,
      tasks: [task({ id: "a", start: at(14), end: at(15) })],
      external: [{ id: "g1", title: "Client", start: at(14), end: at(15) }],
    });
    expect(plan.moves).toEqual([]);
  });
});
