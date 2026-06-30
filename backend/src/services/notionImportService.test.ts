import { describe, expect, test } from "vitest";

import { previewNotionCsvBuffer } from "./notionImportService";

describe("notionImportService", () => {
  test("parses Notion CSV with Name, Status, Blocked by", async () => {
    const csv = `Name,Status,Due,Blocked by
Task A,Not started,2026-06-10,
Task B,In progress,2026-06-12,Task A
Task C,Done,2026-06-15,Task B`;

    const preview = await previewNotionCsvBuffer(Buffer.from(csv, "utf-8"), "user-1", "My Board");
    expect(preview.tasks).toHaveLength(3);
    expect(preview.phases).toEqual([{ name: "Général", taskCount: 3 }]);
    expect(preview.databases[0].dependencyCount).toBe(2);
    expect(preview.errors).toHaveLength(0);
  });

  test("rejects CSV without Name column", async () => {
    const csv = "Foo,Bar\nx,y";
    await expect(previewNotionCsvBuffer(Buffer.from(csv, "utf-8"), "user-1", "X")).rejects.toThrow();
  });
});
