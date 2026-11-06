import { describe, expect, it } from "vitest";

import { blocksFromLegacy, sanitizeNoteBlocks, textHtmlFromBlocks } from "./noteBlocks";

describe("note blocks", () => {
  it("shows an existing diagram before the text", () => {
    const blocks = blocksFromLegacy({
      content: "<p>Bonjour</p>",
      diagram: {
        nodes: [{ id: "n1", label: "SCAN" }],
        edges: [],
        updatedAt: "2026-11-06T00:00:00.000Z",
      },
    });
    expect(blocks.map((block) => block.type)).toEqual(["diagram", "text"]);
    expect(textHtmlFromBlocks(blocks)).toBe("<p>Bonjour</p>");
  });

  it("keeps a text-only note as one text block", () => {
    expect(blocksFromLegacy({ content: "<p>Seul</p>" })).toEqual([
      { id: "text", type: "text", html: "<p>Seul</p>" },
    ]);
  });

  it("drops unknown blocks and keeps an empty diagram the user just added", () => {
    const blocks = sanitizeNoteBlocks(
      [
        { id: "a", type: "text", html: "<p>A</p>" },
        { id: "b", type: "nope" },
        { id: "c", type: "diagram", nodes: [], edges: [] },
      ],
      () => ({ nodes: [], edges: [] }),
    );
    expect(blocks.map((block) => block.id)).toEqual(["a", "c"]);
  });
});
