import { describe, expect, it } from "vitest";
import { parseMarkdownTables } from "./markdownTableParser";

describe("parseMarkdownTables", () => {
  it("parses a simple GFM table", () => {
    const md = `
# Title

| A | B |
|---|---|
| 1 | a |
| 2 | y |
`;
    const tables = parseMarkdownTables(md);
    expect(tables).toHaveLength(1);
    expect(tables[0].headers).toEqual(["A", "B"]);
    expect(tables[0].rows).toEqual([
      ["1", "a"],
      ["2", "y"],
    ]);
  });

  it("returns empty for text without tables", () => {
    expect(parseMarkdownTables("hello world")).toEqual([]);
  });
});
