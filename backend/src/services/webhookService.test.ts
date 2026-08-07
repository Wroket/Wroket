import { afterEach, describe, expect, it, vi } from "vitest";

import {
  _resetWebhooksForTests,
  computeBackoffMs,
  formatWebhookPayload,
  isWebhookInBackoff,
  matchesWebhookFilters,
  recordWebhookDelivery,
  upsertWebhook,
  WEBHOOK_BACKOFF_AFTER_FAILURES,
  type WebhookConfig,
} from "./webhookService";

describe("webhookService Slack+ Lot 1", () => {
  afterEach(() => {
    _resetWebhooksForTests();
    vi.unstubAllGlobals();
  });

  it("computeBackoffMs is zero under threshold then grows, capped", () => {
    expect(computeBackoffMs(0)).toBe(0);
    expect(computeBackoffMs(WEBHOOK_BACKOFF_AFTER_FAILURES - 1)).toBe(0);
    expect(computeBackoffMs(WEBHOOK_BACKOFF_AFTER_FAILURES)).toBe(5 * 60_000);
    expect(computeBackoffMs(WEBHOOK_BACKOFF_AFTER_FAILURES + 1)).toBe(10 * 60_000);
    expect(computeBackoffMs(20)).toBe(60 * 60_000);
  });

  it("matchesWebhookFilters respects project and team lists", () => {
    const wh: Pick<WebhookConfig, "projectIds" | "teamIds"> = {
      projectIds: ["p1"],
      teamIds: ["t1"],
    };
    expect(matchesWebhookFilters(wh, { projectId: "p1", teamId: "t1" })).toBe(true);
    expect(matchesWebhookFilters(wh, { projectId: "p2", teamId: "t1" })).toBe(false);
    expect(matchesWebhookFilters(wh, { projectId: "p1", teamId: "t2" })).toBe(false);
    // Missing ids pass (global / incomplete payloads)
    expect(matchesWebhookFilters(wh, {})).toBe(true);
    expect(matchesWebhookFilters({}, { projectId: "p9" })).toBe(true);
  });

  it("isWebhookInBackoff reads backoffUntil", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(isWebhookInBackoff({ backoffUntil: future } as WebhookConfig)).toBe(true);
    expect(isWebhookInBackoff({ backoffUntil: past } as WebhookConfig)).toBe(false);
    expect(isWebhookInBackoff({} as WebhookConfig)).toBe(false);
  });

  it("recordWebhookDelivery sets health and backoff after repeated failures", async () => {
    const cfg = await upsertWebhook("u1", {
      label: "Test",
      url: "https://hooks.slack.com/services/T/B/X",
      platform: "slack",
      events: ["task_assigned"],
      enabled: true,
    });

    // Avoid real DNS in validate — recordDelivery doesn't need network
    for (let i = 0; i < WEBHOOK_BACKOFF_AFTER_FAILURES; i++) {
      recordWebhookDelivery("u1", cfg.id, { ok: false, statusCode: 500, error: "HTTP 500" });
    }
    expect(cfg.consecutiveFailures).toBe(WEBHOOK_BACKOFF_AFTER_FAILURES);
    expect(cfg.lastStatus).toBe("error");
    expect(cfg.backoffUntil).toBeTruthy();
    expect(isWebhookInBackoff(cfg)).toBe(true);

    recordWebhookDelivery("u1", cfg.id, { ok: true, statusCode: 200 });
    expect(cfg.consecutiveFailures).toBe(0);
    expect(cfg.lastStatus).toBe("ok");
    expect(cfg.backoffUntil).toBeUndefined();
  });

  it("formatWebhookPayload Slack Block Kit includes dependency_blocked emoji/title", () => {
    const body = formatWebhookPayload("slack", {
      event: "dependency_blocked",
      title: "Tâche bloquée",
      message: "Dépendances actives",
      timestamp: new Date().toISOString(),
      data: { todoTitle: "Ship", projectName: "Alpha" },
    }) as { blocks: Array<{ type: string; text?: { text: string }; fields?: unknown }> };

    expect(body.blocks?.length).toBeGreaterThan(0);
    const header = body.blocks[0]?.text?.text ?? "";
    expect(header).toContain("Tâche bloquée");
    expect(header).toContain("🧱");
  });

  it("formatWebhookPayload Slack for milestone_due_soon", () => {
    const body = formatWebhookPayload("slack", {
      event: "milestone_due_soon",
      title: "Jalon proche",
      message: "Bientôt",
      timestamp: new Date().toISOString(),
    }) as { blocks: Array<{ text?: { text: string } }> };
    expect(body.blocks[0]?.text?.text).toContain("🏁");
  });
});
