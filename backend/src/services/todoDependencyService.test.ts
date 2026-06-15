import { describe, expect, test } from "vitest";

import {
  normalizeBlockedByTodoIds,
  wouldCreateDependencyCycle,
} from "./todoDependencyService";

describe("todoDependencyService", () => {
  test("normalizeBlockedByTodoIds dedupes and caps", () => {
    const ids = ["a", "a", "b", " ", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t"];
    expect(normalizeBlockedByTodoIds(ids).length).toBe(20);
    expect(normalizeBlockedByTodoIds(ids)[0]).toBe("a");
    expect(normalizeBlockedByTodoIds(ids)[1]).toBe("b");
  });

  test("wouldCreateDependencyCycle detects simple cycle", () => {
    const graph = new Map<string, string[]>([
      ["a", ["b"]],
      ["b", ["c"]],
      ["c", []],
    ]);
    expect(wouldCreateDependencyCycle(graph, "c", ["a"])).toBe(true);
    expect(wouldCreateDependencyCycle(graph, "c", ["d"])).toBe(false);
  });
});
