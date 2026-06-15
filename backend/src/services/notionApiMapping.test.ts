import { describe, expect, it } from "vitest";

import {
  buildNotionMappingReport,
  buildSchemaSelectOptions,
  findNotionPropertyKey,
  mergeSelectOptionLists,
  NOTION_EFFORT_PROPERTY_CANDIDATES,
  NOTION_DUE_PROPERTY_CANDIDATES,
  registerSelectCustomFieldDef,
} from "./notionApiService";
import { mapNotionEffort, mapNotionPriority } from "./notionImportService";
import type { SyncCustomFieldDef } from "./externalSyncService";

describe("notionApiMapping", () => {
  it("findNotionPropertyKey resolves Effort level to native effort candidate", () => {
    const props = {
      "Effort level": { type: "select", select: { name: "Low" } },
      Name: { type: "title", title: [{ plain_text: "Task" }] },
    };
    const key = findNotionPropertyKey(props, NOTION_EFFORT_PROPERTY_CANDIDATES);
    expect(key).toBe("Effort level");
  });

  it("mapNotionEffort maps Notion Tasks Tracker labels", () => {
    expect(mapNotionEffort("Low")).toBe("light");
    expect(mapNotionEffort("High")).toBe("heavy");
    expect(mapNotionEffort("Medium")).toBe("medium");
  });

  it("mapNotionPriority maps Low/High labels", () => {
    expect(mapNotionPriority("Low")).toBe("low");
    expect(mapNotionPriority("High")).toBe("high");
  });

  it("buildSchemaSelectOptions reads all options from database schema", () => {
    const db = {
      id: "db-1",
      properties: {
        Department: {
          type: "select",
          select: {
            options: [{ name: "Sales" }, { name: "Engineering" }, { name: "Ops" }],
          },
        },
        "Effort level": {
          type: "select",
          select: {
            options: [{ name: "Low" }, { name: "Medium" }, { name: "High" }],
          },
        },
      },
    };
    const map = buildSchemaSelectOptions(db);
    expect(map.get("Department")).toEqual(["Sales", "Engineering", "Ops"]);
    expect(map.get("Effort level")).toEqual(["Low", "Medium", "High"]);
  });

  it("registerSelectCustomFieldDef unions schema and runtime values", () => {
    const schema = new Map<string, string[]>([
      ["Department", ["Sales", "Engineering"]],
    ]);
    const defs = new Map<string, SyncCustomFieldDef>();

    registerSelectCustomFieldDef(defs, schema, "Department", "notion-prop:department", "Ops");
    registerSelectCustomFieldDef(defs, schema, "Department", "notion-prop:department", "Sales");

    const def = defs.get("notion-prop:department");
    expect(def?.options).toEqual(["Sales", "Engineering", "Ops"]);
  });

  it("mergeSelectOptionLists dedupes and caps at 20", () => {
    const merged = mergeSelectOptionLists(["A", "B"], ["B", "C"]);
    expect(merged).toEqual(["A", "B", "C"]);
  });

  it("buildNotionMappingReport lists native effort mapping in warnings", () => {
    const report = buildNotionMappingReport(
      {
        titleKey: "Name",
        phaseKey: "Status",
        priorityKey: null,
        effortKey: "Effort level",
        dueKey: "Due date",
        startKey: null,
        tagsKey: null,
        blockedKey: null,
        descriptionKey: "Description",
      },
      [{ externalKey: "notion-prop:dept", name: "Department", type: "select", options: ["A", "B"] }],
    );
    expect(report.nativeFields.effort).toBe("Effort level");
    expect(report.nativeFields.due).toBe("Due date");
    expect(report.nativeFields.description).toBe("Description");
    expect(report.warnings.some((w) => w.includes("Effort level"))).toBe(true);
    expect(report.warnings.some((w) => w.includes("Due date"))).toBe(true);
    expect(report.warnings.some((w) => w.includes("Description"))).toBe(true);
    expect(report.customFields).toHaveLength(1);
    expect(report.customFields[0].name).toBe("Department");
  });

  it("findNotionPropertyKey resolves Due date for deadline", () => {
    const props = {
      "Due date": { type: "date", date: { start: "2026-06-20" } },
      Name: { type: "title", title: [{ plain_text: "Task" }] },
    };
    expect(findNotionPropertyKey(props, NOTION_DUE_PROPERTY_CANDIDATES)).toBe("Due date");
  });
});
