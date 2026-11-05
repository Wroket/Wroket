import { describe, expect, it } from "vitest";

import { autocorrectOcrText, normalizeOcrLineBreaks } from "./ocrAutocorrect";

describe("normalizeOcrLineBreaks", () => {
  it("preserves intentional handwriting lines that start with a capital", () => {
    expect(
      normalizeOcrLineBreaks(
        "Nouvelle prise de note\nCeci est un test\nCECI EST UN TEST\nEssai de note",
      ),
    ).toBe("Nouvelle prise de note\nCeci est un test\nCECI EST UN TEST\nEssai de note");
  });

  it("joins mid-sentence Vision wraps (lowercase continuation)", () => {
    expect(normalizeOcrLineBreaks("Je serai\nchez Julie")).toBe("Je serai chez Julie");
  });

  it("does not glue a short exclamation onto the previous line", () => {
    expect(normalizeOcrLineBreaks("Bonne journée\ngrand!\n\nJe serai chez Julie")).toBe(
      "Bonne journée\ngrand!\n\nJe serai chez Julie",
    );
  });

  it("returns empty for blank input", () => {
    expect(normalizeOcrLineBreaks("  \n\n ")).toBe("");
  });
});

describe("autocorrectOcrText", () => {
  it("fixes FR slips without flattening capital-started lines", () => {
    expect(autocorrectOcrText("Bonne journer\nground!\nce sori", "fr")).toBe(
      "Bonne journée\ngrand!\nce soir",
    );
    expect(
      autocorrectOcrText("Nouvelle prise de note\nCeci est un test\nEssai de nove", "fr"),
    ).toBe("Nouvelle prise de note\nCeci est un test\nEssai de note");
  });

  it("does not apply FR lexicon for English", () => {
    expect(autocorrectOcrText("see the ground\n", "en")).toBe("see the ground");
  });

  it("preserves sentence case on replacements", () => {
    expect(autocorrectOcrText("Journer", "fr")).toBe("Journée");
  });
});
