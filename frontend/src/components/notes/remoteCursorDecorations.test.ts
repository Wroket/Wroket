import { describe, expect, it } from "vitest";
import { Node, Schema } from "@tiptap/pm/model";

import {
  buildRemoteCaretDecorations,
  colorForUid,
} from "./remoteCursorDecorations";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block", parseDOM: [{ tag: "p" }], toDOM: () => ["p", 0] },
    text: { group: "inline" },
  },
});

describe("remoteCursorDecorations", () => {
  it("colorForUid is stable", () => {
    expect(colorForUid("user-abc")).toBe(colorForUid("user-abc"));
    expect(colorForUid("user-abc").caret).toMatch(/^#/);
  });

  it("buildRemoteCaretDecorations adds selection + caret", () => {
    const doc = Node.fromJSON(schema, {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hello world" }] }],
    });
    const set = buildRemoteCaretDecorations(
      doc,
      [{ uid: "u1", displayName: "François Broudeur", from: 1, to: 6 }],
      (name) => `Cursor of ${name}`,
    );
    expect(set.find().length).toBeGreaterThanOrEqual(2);
  });
});
