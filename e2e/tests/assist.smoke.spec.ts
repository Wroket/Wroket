import { test, expect } from "@playwright/test";

import { apiBase } from "../helpers/apiBase";
import { createVerifiedUser } from "../helpers/localAuth";

/**
 * Smoke Assist PMO (API) — plan-week, risks, committee with projectId.
 * Complements Path to 9 UI suites; no hosted LLM.
 */
test.describe("Assist PMO smoke (API)", () => {
  test.setTimeout(60_000);

  test("plan-week + risks + committee preview (auth)", async ({ request }) => {
    await createVerifiedUser(request);

    const planRes = await request.get(`${apiBase}/assist/plan-week`);
    expect(planRes.ok(), await planRes.text()).toBeTruthy();
    const plan = await planRes.json();
    expect(plan).toMatchObject({
      command: "plan-week",
      focus: expect.any(Array),
      suggestions: expect.any(Array),
      summaryMarkdown: expect.any(String),
    });

    const risksRes = await request.get(`${apiBase}/assist/risks`);
    expect(risksRes.ok(), await risksRes.text()).toBeTruthy();
    const risks = await risksRes.json();
    expect(risks).toMatchObject({
      command: "risks",
      hasTeams: expect.any(Boolean),
      projects: expect.any(Array),
      overdueTasks: expect.any(Array),
      summaryMarkdown: expect.any(String),
    });

    const projRes = await request.post(`${apiBase}/projects`, {
      data: { name: `Assist Smoke ${Date.now()}` },
    });
    expect(projRes.status(), await projRes.text()).toBe(201);
    const project = (await projRes.json()) as { id: string; name: string };

    const committeeRes = await request.get(
      `${apiBase}/assist/committee?projectId=${encodeURIComponent(project.id)}`,
    );
    expect(committeeRes.ok(), await committeeRes.text()).toBeTruthy();
    const committee = await committeeRes.json();
    expect(committee).toMatchObject({
      command: "committee",
      projectId: project.id,
      projectName: project.name,
      steering: expect.any(Object),
      summaryMarkdown: expect.any(String),
    });
  });

  test("committee without projectId → 400", async ({ request }) => {
    await createVerifiedUser(request);
    const res = await request.get(`${apiBase}/assist/committee`);
    expect(res.status()).toBe(400);
  });
});
