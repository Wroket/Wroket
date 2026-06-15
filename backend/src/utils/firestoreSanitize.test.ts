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
});
