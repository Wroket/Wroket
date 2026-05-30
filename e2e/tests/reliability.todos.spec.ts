import { test, expect } from "@playwright/test";

import { apiBase } from "../helpers/apiBase";
import { createVerifiedUser } from "../helpers/localAuth";

test.describe("Reliability — todos persistence (local store)", () => {
  test("POST /todos then GET /todos returns the created task", async ({ request }) => {
    await createVerifiedUser(request);
    const title = `E2E reliability todo ${Date.now()}`;

    const createRes = await request.post(`${apiBase}/todos`, {
      data: { title, priority: "medium" },
    });
    expect(createRes.status()).toBe(201);
    const created = (await createRes.json()) as { id: string; title: string };
    expect(created.title).toBe(title);

    const listRes = await request.get(`${apiBase}/todos`);
    expect(listRes.ok()).toBeTruthy();
    const list = (await listRes.json()) as Array<{ id: string; title: string }>;
    expect(list.some((t) => t.id === created.id && t.title === title)).toBe(true);

    const secondList = await request.get(`${apiBase}/todos`);
    expect(secondList.ok()).toBeTruthy();
    const list2 = (await secondList.json()) as Array<{ id: string }>;
    expect(list2.some((t) => t.id === created.id)).toBe(true);
  });
});
