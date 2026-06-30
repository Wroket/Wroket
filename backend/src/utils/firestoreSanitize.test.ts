import { describe, expect, it } from "vitest";

import { stripUndefinedDeep } from "./firestoreSanitize";

describe("stripUndefinedDeep", () => {
  it("removes undefined top-level and nested fields", () => {
    const input = {
      id: "t1",
      title: "Test",
      externalRef: undefined,
      tags: ["a"],
      slot: { start: "2026-01-01T00:00:00.000Z", end: "2026-01-01T01:00:00.000Z", extra: undefined },
      nullable: null,
    };
    expect(stripUndefinedDeep(input)).toEqual({
      id: "t1",
      title: "Test",
      tags: ["a"],
      slot: { start: "2026-01-01T00:00:00.000Z", end: "2026-01-01T01:00:00.000Z" },
      nullable: null,
    });
  });

  // Regression: incident 2026-06-30 — these exact store/* payload shapes carried
  // `undefined` and blocked the whole Firestore flush in a watchdog retry loop.
  it("strips undefined in a store/notes flush payload (note tags cleared)", () => {
    const payload = {
      data: {
        userHash: {
          "cb67fd5d-78c3-49d2-8d7d-ac0bc419e3a5": {
            id: "cb67fd5d-78c3-49d2-8d7d-ac0bc419e3a5",
            title: "Sans titre",
            tags: undefined,
            folder: undefined,
          },
        },
      },
    };
    expect(stripUndefinedDeep(payload)).toEqual({
      data: {
        userHash: {
          "cb67fd5d-78c3-49d2-8d7d-ac0bc419e3a5": {
            id: "cb67fd5d-78c3-49d2-8d7d-ac0bc419e3a5",
            title: "Sans titre",
          },
        },
      },
    });
  });

  it("strips undefined in a store/projects flush payload (phase without externalRef)", () => {
    const payload = {
      data: {
        "747c0d2c-8c44-45a5-bcb2-864d7466824c": {
          id: "747c0d2c-8c44-45a5-bcb2-864d7466824c",
          phases: [
            { id: "p0", name: "Phase 1", externalRef: undefined },
            { id: "p1", name: "Phase 2", externalRef: { provider: "monday", externalId: "x" } },
          ],
        },
      },
    };
    expect(stripUndefinedDeep(payload)).toEqual({
      data: {
        "747c0d2c-8c44-45a5-bcb2-864d7466824c": {
          id: "747c0d2c-8c44-45a5-bcb2-864d7466824c",
          phases: [
            { id: "p0", name: "Phase 1" },
            { id: "p1", name: "Phase 2", externalRef: { provider: "monday", externalId: "x" } },
          ],
        },
      },
    });
  });
});
