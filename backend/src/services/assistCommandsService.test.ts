import { describe, expect, test } from "vitest";

import { register, setBillingPlanForUid } from "./authService";
import {
  applyCommitteeShare,
  applyPlanWeekBooks,
  previewCommittee,
  previewPlanWeek,
  previewRisks,
} from "./assistCommandsService";
import { createProject } from "./projectService";
import { createTodo, updateTodo } from "./todoService";

describe("assistCommandsService", () => {
  test("previewCommittee returns steering and allows share apply", async () => {
    const user = register({
      email: `assist-committee-${Date.now()}@test.local`,
      password: "password123",
    });
    setBillingPlanForUid(user.uid, "small");
    const project = createProject(user.uid, user.email, { name: "Comité Alpha" });
    await createTodo(user.uid, user.email, {
      title: "Task comité",
      priority: "high",
      projectId: project.id,
    });

    const preview = await previewCommittee(user.uid, user.email, project.id);
    expect(preview.command).toBe("committee");
    expect(preview.projectName).toBe("Comité Alpha");
    expect(preview.steering).toBeTruthy();
    expect(preview.summaryMarkdown).toMatch(/Comité/);
    expect(preview.canCreateShareLink).toBe(true);

    const applied = applyCommitteeShare(user.uid, user.email, project.id);
    expect(applied.link.token).toBeTruthy();
    expect(applied.publicUrl).toContain(applied.link.token);
  });

  test("previewPlanWeek and applyPlanWeekBooks", async () => {
    const user = register({
      email: `assist-week-${Date.now()}@test.local`,
      password: "password123",
    });
    setBillingPlanForUid(user.uid, "small");
    const todo = await createTodo(user.uid, user.email, {
      title: "À planifier",
      priority: "high",
    });
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 3);
    await updateTodo(user.uid, user.email, todo.id, {
      deadline: deadline.toISOString().slice(0, 10),
    });

    const preview = await previewPlanWeek(user.uid, user.email);
    expect(preview.command).toBe("plan-week");
    expect(preview.summaryMarkdown).toMatch(/Planifie/);

    if (preview.suggestions.length > 0) {
      const s = preview.suggestions[0];
      const applied = await applyPlanWeekBooks(
        user.uid,
        user.email,
        [{ todoId: s.todoId, start: s.proposedStart, end: s.proposedEnd }],
        true,
      );
      expect(applied.booked.length + applied.conflicts.length + applied.errors.length).toBeGreaterThan(0);
    }
  });

  test("previewRisks returns structured payload", async () => {
    const user = register({
      email: `assist-risks-${Date.now()}@test.local`,
      password: "password123",
    });
    setBillingPlanForUid(user.uid, "free");
    const preview = await previewRisks(user.uid, user.email);
    expect(preview.command).toBe("risks");
    expect(preview.hasTeams).toBe(false);
    expect(preview.summaryMarkdown.length).toBeGreaterThan(0);
  });

  test("applyPlanWeekBooks rejects empty list", async () => {
    const user = register({
      email: `assist-empty-${Date.now()}@test.local`,
      password: "password123",
    });
    await expect(applyPlanWeekBooks(user.uid, user.email, [])).rejects.toThrow(/Aucune réservation/);
  });
});
