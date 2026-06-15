import { describe, expect, test } from "vitest";

import { buildMondayCsvSnapshot, mapMondayStatus } from "./mondayApiService";

describe("mondayApiService", () => {
  test("mapMondayStatus maps done labels to completed", () => {
    expect(mapMondayStatus("Done")).toBe("completed");
    expect(mapMondayStatus("Terminé")).toBe("completed");
    expect(mapMondayStatus("Working on it")).toBe("active");
    expect(mapMondayStatus("")).toBe("active");
  });

  test("buildMondayCsvSnapshot parses groups and tasks", () => {
    const csv = [
      "Name,Group,Status,Date",
      "Group: In progress,,,",
      "Task A,In progress,Working on it,2026-03-01",
      "Task B,In progress,Done,2026-03-15",
    ].join("\n");

    const { snapshot } = buildMondayCsvSnapshot(Buffer.from(csv, "utf8"), "Client Beta");
    expect(snapshot.provider).toBe("monday");
    expect(snapshot.projectName).toBe("Client Beta");
    expect(snapshot.phases).toHaveLength(1);
    expect(snapshot.phases[0].name).toBe("In progress");
    expect(snapshot.tasks).toHaveLength(2);
    expect(snapshot.tasks[0].title).toBe("Task A");
    expect(snapshot.tasks[0].status).toBe("active");
    expect(snapshot.tasks[1].status).toBe("completed");
    expect(snapshot.tasks[1].deadline).toBe("2026-03-15");
  });

  test("buildMondayCsvSnapshot rejects missing Name column", () => {
    const csv = "Status,Group\nDone,General\n";
    expect(() => buildMondayCsvSnapshot(Buffer.from(csv, "utf8"), "X")).toThrow();
  });
});
