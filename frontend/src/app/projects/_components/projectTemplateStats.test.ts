import { describe, expect, it } from "vitest";

import { getProjectTemplateStats, PROJECT_TEMPLATES } from "./types";

describe("getProjectTemplateStats", () => {
  it("counts basic template as 6 phases and 54 todos", () => {
    const basic = PROJECT_TEMPLATES.find((t) => t.id === "basic");
    expect(basic).toBeDefined();
    const stats = getProjectTemplateStats(basic!);
    expect(stats.phases).toBe(6);
    expect(stats.parentTasks).toBe(18);
    expect(stats.totalTodos).toBe(54);
  });

  it("counts agile-sprint as 4 phases and 36 todos", () => {
    const tpl = PROJECT_TEMPLATES.find((t) => t.id === "agile-sprint");
    expect(tpl).toBeDefined();
    const stats = getProjectTemplateStats(tpl!);
    expect(stats.phases).toBe(4);
    expect(stats.totalTodos).toBe(36);
  });

  it("counts quick-start as 2 phases and 8 todos (free tier)", () => {
    const tpl = PROJECT_TEMPLATES.find((t) => t.id === "quick-start");
    expect(tpl).toBeDefined();
    expect(tpl!.freeTier).toBe(true);
    const stats = getProjectTemplateStats(tpl!);
    expect(stats.phases).toBe(2);
    expect(stats.parentTasks).toBe(4);
    expect(stats.totalTodos).toBe(8);
  });

  it("counts agile-sprint-lite as 2 phases and 18 todos (free tier)", () => {
    const tpl = PROJECT_TEMPLATES.find((t) => t.id === "agile-sprint-lite");
    expect(tpl).toBeDefined();
    expect(tpl!.freeTier).toBe(true);
    const stats = getProjectTemplateStats(tpl!);
    expect(stats.phases).toBe(2);
    expect(stats.parentTasks).toBe(6);
    expect(stats.totalTodos).toBe(18);
  });

  it("keeps all free-tier templates at or below 25 todos", () => {
    for (const tpl of PROJECT_TEMPLATES.filter((t) => t.freeTier)) {
      expect(getProjectTemplateStats(tpl).totalTodos).toBeLessThanOrEqual(25);
    }
  });
});
