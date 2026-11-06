import { beforeEach, describe, expect, it } from "vitest";

import {
  __resetTaskSuggestQuota,
  sanitizeTaskSuggestions,
  suggestTasksForUser,
} from "./taskSuggestService";

beforeEach(() => {
  __resetTaskSuggestQuota();
  delete process.env.TASK_SUGGEST_ENABLED;
  delete process.env.TASK_SUGGEST_PROVIDER;
  delete process.env.TASK_SUGGEST_BETA_EMAILS;
});

describe("task suggestions", () => {
  it("stays off unless the flag is exactly true", async () => {
    await expect(
      suggestTasksForUser({ uid: "u1", email: "a@test.com", text: "Appeler Julie", consent: "yes" }),
    ).rejects.toMatchObject({ code: "TASK_SUGGEST_DISABLED" });
  });

  it("returns a mock list without calling a model", async () => {
    process.env.TASK_SUGGEST_ENABLED = "true";
    process.env.TASK_SUGGEST_PROVIDER = "mock";
    const result = await suggestTasksForUser({
      uid: "u1",
      email: "a@test.com",
      text: "Préparer la revue",
      consent: "yes",
    });
    expect(result.provider).toBe("mock");
    expect(result.tasks[0]?.title).toBe("Relire la note");
  });

  it("drops empty titles and invalid dates", () => {
    const tasks = sanitizeTaskSuggestions({
      tasks: [
        { title: "  Appeler Julie  ", deadline: "demain", priority: "high" },
        { title: "x", deadline: "2026-11-06" },
        { title: "Envoyer\nle compte-rendu", deadline: "2026-11-06T18:00:00", priority: "nope" },
      ],
    });
    expect(tasks).toEqual([
      { title: "Appeler Julie", deadline: "", priority: "high" },
      { title: "Envoyer le compte-rendu", deadline: "2026-11-06", priority: "medium" },
    ]);
  });
});
