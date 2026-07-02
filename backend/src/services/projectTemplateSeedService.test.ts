import { describe, expect, it, vi, beforeEach } from "vitest";

import { countSeedTemplateTodos } from "./projectTemplateSeedService";

describe("countSeedTemplateTodos", () => {
  it("counts parents and subtasks", () => {
    const n = countSeedTemplateTodos([
      {
        name: "Phase 1",
        tasks: [
          { title: "A", subtasks: [{ title: "A1" }, { title: "A2" }] },
          { title: "B", subtasks: [{ title: "B1" }] },
        ],
      },
      {
        name: "Phase 2",
        tasks: [{ title: "C", subtasks: [] }],
      },
    ]);
    expect(n).toBe(6);
  });
});

describe("getFreeQuotaSnapshot early bird bypass", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns null when volume quotas do not apply (early bird)", async () => {
    vi.doMock("./authService", () => ({
      shouldApplyFreeTierVolumeQuotas: () => false,
    }));
    vi.doMock("./noteService", () => ({ countPersonalNotesForQuota: async () => 0 }));
    vi.doMock("./projectService", () => ({ countPersonalActiveProjectsForQuota: () => 0 }));
    vi.doMock("./todoService", () => ({ countPersonalActiveTodosForQuota: async () => 99 }));

    const { getFreeQuotaSnapshot } = await import("./quotaUsageService");
    const snap = await getFreeQuotaSnapshot("uid-early");
    expect(snap).toBeNull();
  });
});
