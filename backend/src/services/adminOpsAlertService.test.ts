import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendAdminOpsAlertEmail = vi.fn().mockResolvedValue(undefined);

vi.mock("./emailService", () => ({
  isSmtpConfiguredForOutbound: () => true,
  sendAdminOpsAlertEmail,
}));

vi.mock("./adminService", () => ({
  getAdminEmails: () => ["admin@test.com"],
}));

describe("adminOpsAlertService", () => {
  beforeEach(() => {
    vi.resetModules();
    sendAdminOpsAlertEmail.mockClear();
    process.env.NODE_ENV = "production";
    process.env.USE_LOCAL_STORE = "false";
    process.env.ADMIN_OPS_ALERT_COOLDOWN_MINUTES = "60";
    delete process.env.ADMIN_OPS_ALERTS_ENABLED;
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.USE_LOCAL_STORE;
    delete process.env.ADMIN_OPS_ALERT_COOLDOWN_MINUTES;
  });

  it("sends alert on first persistence failure notification", async () => {
    const { maybeNotifyAdminOpsAlert, _resetAdminOpsAlertCooldownForTests } = await import("./adminOpsAlertService");
    _resetAdminOpsAlertCooldownForTests();
    maybeNotifyAdminOpsAlert({
      kind: "persistence_flush",
      title: "Test flush",
      lines: ["line 1"],
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(sendAdminOpsAlertEmail).toHaveBeenCalledTimes(1);
    expect(sendAdminOpsAlertEmail).toHaveBeenCalledWith(["admin@test.com"], "Test flush", ["line 1"]);
  });

  it("respects cooldown for the same alert kind", async () => {
    const { maybeNotifyAdminOpsAlert, _resetAdminOpsAlertCooldownForTests } = await import("./adminOpsAlertService");
    _resetAdminOpsAlertCooldownForTests();
    maybeNotifyAdminOpsAlert({ kind: "persistence_flush", title: "A", lines: [] });
    maybeNotifyAdminOpsAlert({ kind: "persistence_flush", title: "B", lines: [] });
    await new Promise((r) => setTimeout(r, 10));
    expect(sendAdminOpsAlertEmail).toHaveBeenCalledTimes(1);
  });

  it("allows separate kinds within cooldown window", async () => {
    const { maybeNotifyAdminOpsAlert, _resetAdminOpsAlertCooldownForTests } = await import("./adminOpsAlertService");
    _resetAdminOpsAlertCooldownForTests();
    maybeNotifyAdminOpsAlert({ kind: "persistence_flush", title: "A", lines: [] });
    maybeNotifyAdminOpsAlert({ kind: "todos_drift", title: "B", lines: [] });
    await new Promise((r) => setTimeout(r, 10));
    expect(sendAdminOpsAlertEmail).toHaveBeenCalledTimes(2);
  });

  it("does not send in local store mode", async () => {
    process.env.USE_LOCAL_STORE = "true";
    vi.resetModules();
    const { maybeNotifyAdminOpsAlert, _resetAdminOpsAlertCooldownForTests } = await import("./adminOpsAlertService");
    _resetAdminOpsAlertCooldownForTests();
    maybeNotifyAdminOpsAlert({ kind: "persistence_flush", title: "A", lines: [] });
    await new Promise((r) => setTimeout(r, 10));
    expect(sendAdminOpsAlertEmail).not.toHaveBeenCalled();
  });

  it("isPersistenceFlushStale ignores old lastFlushAt — requires dirtyAgeMs", async () => {
    const { isPersistenceFlushStale } = await import("./adminOpsAlertService");
    const staleMs = 10 * 60 * 1000;
    // Quiet period then a fresh write: dirty briefly, age under threshold → no alert
    expect(
      isPersistenceFlushStale(
        {
          dirtyDomainsCount: 1,
          dirtyShardsCount: 0,
          dirtyAgeMs: 5_000,
          consecutiveFlushFailures: 0,
        },
        staleMs,
      ),
    ).toBe(false);
    // Dirty stuck > 10 min → alert
    expect(
      isPersistenceFlushStale(
        {
          dirtyDomainsCount: 1,
          dirtyShardsCount: 0,
          dirtyAgeMs: staleMs + 1,
          consecutiveFlushFailures: 0,
        },
        staleMs,
      ),
    ).toBe(true);
    // Clean → no alert
    expect(
      isPersistenceFlushStale(
        {
          dirtyDomainsCount: 0,
          dirtyShardsCount: 0,
          dirtyAgeMs: null,
          consecutiveFlushFailures: 0,
        },
        staleMs,
      ),
    ).toBe(false);
    // Exhausted flush path has its own alert kind
    expect(
      isPersistenceFlushStale(
        {
          dirtyDomainsCount: 1,
          dirtyShardsCount: 0,
          dirtyAgeMs: staleMs + 1,
          consecutiveFlushFailures: 2,
        },
        staleMs,
      ),
    ).toBe(false);
  });
});
