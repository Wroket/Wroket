import { describe, expect, it } from "vitest";

import { rowsForApply } from "./diagramApply";

describe("rowsForApply", () => {
  it("leaves a new box checked and an existing one unchecked", () => {
    const rows = rowsForApply(
      [
        { id: "n1", label: " SCAN " },
        { id: "n2", label: "AFFICHAGE\nDANS\nNOTES", column: " Suite " },
        { id: "n3", label: "   " },
      ],
      new Set(["n1"]),
    );
    expect(rows).toEqual([
      { id: "n1", label: "SCAN", column: "", included: false, existed: true },
      { id: "n2", label: "AFFICHAGE DANS NOTES", column: "Suite", included: true, existed: false },
    ]);
  });
});
