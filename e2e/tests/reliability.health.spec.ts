import { test, expect } from "@playwright/test";

import { apiBase } from "../helpers/apiBase";

test.describe("Reliability — health/ready (local store)", () => {
  test("GET /health/ready exposes store, persistence and todosDrift", async ({ request }) => {
    const res = await request.get(`${apiBase}/health/ready`);
    const body = await res.json();

    expect([200, 503]).toContain(res.status());
    expect(body).toMatchObject({
      status: expect.stringMatching(/^(ok|degraded)$/),
      uptime: expect.any(Number),
      timestamp: expect.any(String),
    });

    expect(body.store).toMatchObject({
      ok: expect.any(Boolean),
      backend: expect.stringMatching(/^(local|firestore)$/),
    });

    expect(body.persistence).toMatchObject({
      consecutiveFlushFailures: expect.any(Number),
      dirtyDomainsCount: expect.any(Number),
    });

    expect(body.todosDrift).toMatchObject({
      status: expect.stringMatching(/^(ok|skipped|warn|drift|error)$/),
    });

    if (body.store.backend === "local") {
      expect(res.status()).toBe(200);
      expect(body.status).toBe("ok");
      expect(body.todosDrift.status).not.toBe("error");
    }
  });

  test("GET /health liveness stays ok", async ({ request }) => {
    const res = await request.get(`${apiBase}/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toMatchObject({ status: "ok", uptime: expect.any(Number) });
  });
});
