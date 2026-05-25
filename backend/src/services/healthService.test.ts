import { describe, expect, it, vi, beforeEach } from "vitest";

// Hoisted mock: replace the persistence module before healthService is imported
// so that getReadinessStatus picks up our test stubs instead of the real
// (Firestore-touching) implementation.
vi.mock("../persistence", () => ({
  pingDatastore: vi.fn(),
  getPersistenceMetrics: vi.fn(),
}));

import { getReadinessStatus } from "./healthService";
import { pingDatastore, getPersistenceMetrics } from "../persistence";

const mockedPing = pingDatastore as unknown as ReturnType<typeof vi.fn>;
const mockedMetrics = getPersistenceMetrics as unknown as ReturnType<typeof vi.fn>;

function metricsFixture(overrides: Partial<ReturnType<typeof getPersistenceMetrics>> = {}) {
  return {
    lastFlushAt: "2026-05-26T00:00:00.000Z",
    lastFlushOpsCount: 3,
    lastFlushDurationMs: 42,
    consecutiveFlushFailures: 0,
    failedFlushAttempts: 0,
    dirtyDomainsCount: 0,
    dirtyShardsCount: 0,
    ...overrides,
  };
}

describe("getReadinessStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok when store is reachable and persistence is healthy", async () => {
    mockedPing.mockResolvedValue({ ok: true, backend: "firestore" });
    mockedMetrics.mockReturnValue(metricsFixture());

    const r = await getReadinessStatus();

    expect(r.status).toBe("ok");
    expect(r.store).toEqual({ ok: true, backend: "firestore" });
    expect(r.persistence.consecutiveFlushFailures).toBe(0);
    expect(r.persistence.lastFlushAt).toBe("2026-05-26T00:00:00.000Z");
  });

  it("downgrades to degraded when Firestore is unreachable", async () => {
    mockedPing.mockResolvedValue({ ok: false, backend: "firestore" });
    mockedMetrics.mockReturnValue(metricsFixture());

    const r = await getReadinessStatus();

    expect(r.status).toBe("degraded");
  });

  it("downgrades to degraded when persistence flush has been failing in a row", async () => {
    mockedPing.mockResolvedValue({ ok: true, backend: "firestore" });
    mockedMetrics.mockReturnValue(metricsFixture({ consecutiveFlushFailures: 2, failedFlushAttempts: 6 }));

    const r = await getReadinessStatus();

    expect(r.status).toBe("degraded");
    expect(r.persistence.consecutiveFlushFailures).toBe(2);
    expect(r.persistence.failedFlushAttempts).toBe(6);
  });
});
