import { describe, expect, test } from "vitest";

import { validateCustomFieldValues } from "./customFieldService";
import { addCustomFieldDef, createProject } from "./projectService";

describe("customFieldService", () => {
  test("validateCustomFieldValues coerces types", () => {
    const project = createProject("u1", "u1@test.com", { name: "P" });
    const def = addCustomFieldDef(project.id, { name: "Score", type: "number" });
    const selectDef = addCustomFieldDef(project.id, {
      name: "Status",
      type: "select",
      options: ["A", "B"],
    });

    const out = validateCustomFieldValues(project.id, [], {
      [def.id]: 42,
      [selectDef.id]: "A",
      unknown: "x",
    });

    expect(out[def.id]).toBe(42);
    expect(out[selectDef.id]).toBe("A");
    expect(out.unknown).toBeUndefined();
  });

  test("rejects invalid select option", () => {
    const project = createProject("u2", "u2@test.com", { name: "P2" });
    const def = addCustomFieldDef(project.id, {
      name: "Pick",
      type: "select",
      options: ["Yes"],
    });
    expect(() =>
      validateCustomFieldValues(project.id, [], { [def.id]: "No" }),
    ).toThrow();
  });
});
