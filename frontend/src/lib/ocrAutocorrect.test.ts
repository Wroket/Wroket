import { describe, expect, it } from "vitest";

import { autocorrectOcrText, normalizeOcrLineBreaks } from "./ocrAutocorrect";

describe("normalizeOcrLineBreaks", () => {
  it("joins single newlines into spaces", () => {
    expect(normalizeOcrLineBreaks("Bonne journer\ngrand!\nJe serai chez")).toBe(
      "Bonne journer grand! Je serai chez",
    );
  });

  it("keeps paragraph breaks", () => {
    expect(normalizeOcrLineBreaks("A\nB\n\nC\nD")).toBe("A B\n\nC D");
  });

  it("returns empty for blank input", () => {
    expect(normalizeOcrLineBreaks("  \n\n ")).toBe("");
  });
});

describe("autocorrectOcrText", () => {
  it("fixes common FR handwriting OCR slips", () => {
    expect(autocorrectOcrText("Bonne journer\nground!\nce sori", "fr")).toBe(
      "Bonne journée grand! ce soir",
    );
    expect(autocorrectOcrText("Bonne jauner\nce sor\nde nove", "fr")).toBe(
      "Bonne journée ce soir de note",
    );
  });

  it("does not apply FR lexicon for English", () => {
    expect(autocorrectOcrText("see the ground\n", "en")).toBe("see the ground");
  });

  it("preserves sentence case on replacements", () => {
    expect(autocorrectOcrText("Journer", "fr")).toBe("Journée");
  });
});
