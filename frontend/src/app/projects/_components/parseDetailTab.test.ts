import { describe, expect, it } from "vitest";

import { parseDetailTab } from "./types";

describe("parseDetailTab", () => {
  it("accepts canonical tabs", () => {
    expect(parseDetailTab("pilotage")).toBe("pilotage");
    expect(parseDetailTab("board")).toBe("board");
    expect(parseDetailTab("kanban")).toBe("kanban");
  });

  it("maps list/steering aliases", () => {
    expect(parseDetailTab("list")).toBe("board");
    expect(parseDetailTab("LIST")).toBe("board");
    expect(parseDetailTab("steering")).toBe("pilotage");
  });

  it("returns null for unknown values", () => {
    expect(parseDetailTab(null)).toBeNull();
    expect(parseDetailTab("agenda")).toBeNull();
  });
});
