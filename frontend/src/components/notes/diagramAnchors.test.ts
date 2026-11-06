import { describe, expect, test } from "vitest";

import { stickyAnchor } from "./diagramAnchors";

const box = { x: 0.1, y: 0.2, w: 0.2, h: 0.1 };

describe("stickyAnchor", () => {
  test("picks the side facing the other box", () => {
    const right = stickyAnchor(box, 0.8, 0.25);
    const below = stickyAnchor(box, 0.2, 0.9);
    const left = stickyAnchor(box, 0, 0.25);
    const above = stickyAnchor(box, 0.2, 0);
    expect(right.x).toBeCloseTo(0.3);
    expect(right.y).toBeCloseTo(0.25);
    expect(below.y).toBeCloseTo(0.3);
    expect(left.x).toBeCloseTo(0.1);
    expect(above.y).toBeCloseTo(0.2);
  });
});