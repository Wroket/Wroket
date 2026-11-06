import { describe, expect, it } from "vitest";

import { parseNoteTaskLines } from "./noteTaskLines";

describe("parseNoteTaskLines", () => {
  const today = new Date("2026-06-01T00:00:00");

  it("keeps bullets, TODOs and a trailing date", () => {
    const html = "<ul><li>Appeler le client 12/06</li><li>Relire</li></ul><p>TODO envoyer le compte rendu 2026-07-01</p><p>Une phrase normale</p>";
    const lines = parseNoteTaskLines(html, today);
    expect(lines.map((l) => l.title)).toEqual([
      "Appeler le client",
      "Relire",
      "envoyer le compte rendu",
    ]);
    expect(lines[0]?.deadline).toBe("2026-06-12");
    expect(lines[2]?.deadline).toBe("2026-07-01");
    expect(lines.every((l) => l.included)).toBe(true);
  });

  it("ignores prose and caps at 25", () => {
    const items = Array.from({ length: 30 }, (_, i) => `<li>Étape ${i}</li>`).join("");
    const lines = parseNoteTaskLines(`<ul>${items}</ul>`, today);
    expect(lines).toHaveLength(25);
    expect(parseNoteTaskLines("<p>Bonjour</p>", today)).toEqual([]);
  });
});