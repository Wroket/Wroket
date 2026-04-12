import { test, expect } from "@playwright/test";

const apiBase = process.env.E2E_API_BASE_URL ?? "http://localhost:3001";

test.describe("API smoke", () => {
  test("GET /health returns ok", async ({ request }) => {
    const res = await request.get(`${apiBase}/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toMatchObject({ status: "ok" });
    expect(typeof body.uptime).toBe("number");
    expect(typeof body.timestamp).toBe("string");
  });
});
