import { describe, expect, it } from "vitest";

import { proseFromCapture } from "./digitizeText";

describe("proseFromCapture", () => {
  it("drops lines that are only a box label and keeps the surrounding sentences", () => {
    const text = proseFromCapture("Notes écrites\nAppeler Julie ce soir.\nSCAN", "", ["Notes écrites", "SCAN"]);
    expect(text).toBe("Appeler Julie ce soir.");
  });

  it("uses the diagram aside when the OCR text is only the box labels", () => {
    expect(proseFromCapture("SCAN\nIMPORT", "À faire demain", ["SCAN", "IMPORT"])).toBe("À faire demain");
  });

  it("prefers the OCR sentence over the aside", () => {
    expect(proseFromCapture("Relire le compte-rendu", "autre texte", ["SCAN"])).toBe("Relire le compte-rendu");
  });

  it("returns an empty string when both sources are blank", () => {
    expect(proseFromCapture("  ", "", [])).toBe("");
  });

  it("drops a line that only restates several box labels mashed by OCR", () => {
    const text = proseFromCapture(
      "WORKFLOW USER\nI SCAN\nAFFICHAGE\nNotes WROKET IMPORT NOTES DANS écrites",
      "",
      ["Notes écrites", "WROKET", "SCAN", "IMPORT", "AFFICHAGE DANS NOTES"],
    );
    expect(text).toBe("WORKFLOW USER");
  });
});