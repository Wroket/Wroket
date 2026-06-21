import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const maybeNotifyAdminOpsAlert = vi.fn();

vi.mock("./adminOpsAlertService", () => ({
  maybeNotifyAdminOpsAlert,
}));

describe("emailDeliveryMonitor", () => {
  beforeEach(() => {
    vi.resetModules();
    maybeNotifyAdminOpsAlert.mockClear();
  });

  afterEach(async () => {
    const { _resetEmailDeliveryStatsForTests } = await import("./emailDeliveryMonitor");
    _resetEmailDeliveryStatsForTests();
  });

  it("alerts after 3 failures with no success in 1 h", async () => {
    const { recordEmailDeliveryFailure, _resetEmailDeliveryStatsForTests } = await import(
      "./emailDeliveryMonitor"
    );
    _resetEmailDeliveryStatsForTests();
    recordEmailDeliveryFailure(new Error("smtp down"));
    recordEmailDeliveryFailure(new Error("smtp down"));
    recordEmailDeliveryFailure(new Error("smtp down"));
    await new Promise((r) => setTimeout(r, 10));
    expect(maybeNotifyAdminOpsAlert).toHaveBeenCalledTimes(1);
    expect(maybeNotifyAdminOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "smtp_degraded" }),
    );
  });

  it("does not alert when failures are balanced by successes", async () => {
    const {
      recordEmailDeliveryFailure,
      recordEmailDeliverySuccess,
      _resetEmailDeliveryStatsForTests,
    } = await import("./emailDeliveryMonitor");
    _resetEmailDeliveryStatsForTests();
    recordEmailDeliverySuccess();
    recordEmailDeliverySuccess();
    recordEmailDeliveryFailure(new Error("once"));
    await new Promise((r) => setTimeout(r, 10));
    expect(maybeNotifyAdminOpsAlert).not.toHaveBeenCalled();
  });

  it("alerts on high failure rate with enough attempts", async () => {
    const {
      recordEmailDeliverySuccess,
      probeSmtpDeliveryHealth,
      _recordEmailDeliveryFailureForTests,
      _resetEmailDeliveryStatsForTests,
    } = await import("./emailDeliveryMonitor");
    _resetEmailDeliveryStatsForTests();
    recordEmailDeliverySuccess();
    for (let i = 0; i < 5; i++) _recordEmailDeliveryFailureForTests();
    probeSmtpDeliveryHealth();
    await new Promise((r) => setTimeout(r, 10));
    expect(maybeNotifyAdminOpsAlert).toHaveBeenCalledTimes(1);
  });
});
