import { describe, expect, it } from "vitest";

import { detectNotionDatabaseKind } from "./notionApiService";

/** Typical Notion People / CRM base. */
const PEOPLE_PROPERTIES = {
  Name: { type: "title" },
  Email: { type: "email" },
  Phone: { type: "phone_number" },
  Company: { type: "rich_text" },
};

/** Tasks Tracker–style project base. */
const TASKS_PROPERTIES = {
  Name: { type: "title" },
  Status: {
    type: "status",
    status: {
      options: [
        { name: "Not started" },
        { name: "In progress" },
        { name: "Done" },
      ],
    },
  },
  "Due date": { type: "date" },
  "Effort level": {
    type: "select",
    select: { options: [{ name: "Low" }, { name: "High" }] },
  },
  "Priority level": {
    type: "select",
    select: { options: [{ name: "Low" }, { name: "High" }] },
  },
};

describe("detectNotionDatabaseKind", () => {
  it("classifies a People base as contacts", () => {
    const result = detectNotionDatabaseKind("People", PEOPLE_PROPERTIES);
    expect(result.suggestedKind).toBe("contacts");
    expect(result.kindScore).toBeGreaterThanOrEqual(4);
  });

  it("classifies Tasks Tracker as project", () => {
    const result = detectNotionDatabaseKind("Tasks Tracker", TASKS_PROPERTIES);
    expect(result.suggestedKind).toBe("project");
    expect(result.kindScore).toBeLessThanOrEqual(0);
  });

  it("returns ambiguous for mixed weak signals", () => {
    const props = {
      Name: { type: "title" },
      Email: { type: "email" },
      Notes: { type: "rich_text" },
    };
    const result = detectNotionDatabaseKind("Records", props);
    expect(result.suggestedKind).toBe("ambiguous");
    expect(result.kindScore).toBeGreaterThan(0);
    expect(result.kindScore).toBeLessThan(4);
  });

  it("boosts score when database title contains contact keywords", () => {
    const props = { Name: { type: "title" }, Email: { type: "email" } };
    const withTitle = detectNotionDatabaseKind("CRM Contacts", props);
    const without = detectNotionDatabaseKind("Database", props);
    expect(withTitle.kindScore).toBeGreaterThan(without.kindScore);
    expect(withTitle.suggestedKind).toBe("contacts");
  });
});
