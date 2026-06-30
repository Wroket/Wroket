import { pingDatastore, getPersistenceMetrics } from "../persistence";
import { getTodosDriftStatus, type TodosDriftStatus } from "./todosDriftMonitor";

export interface HealthStatus {
  status: "ok";
  uptime: number;
  timestamp: string;
}

export const getHealthStatus = (): HealthStatus => ({
  status: "ok",
  uptime: process.uptime(),
  timestamp: new Date().toISOString(),
});

export interface PersistenceHealthMetrics {
  lastFlushAt: string | null;
  lastFlushOpsCount: number;
  lastFlushDurationMs: number | null;
  consecutiveFlushFailures: number;
  failedFlushAttempts: number;
  dirtyDomainsCount: number;
  dirtyShardsCount: number;
}

export interface ReadinessStatus {
  status: "ok" | "degraded";
  uptime: number;
  timestamp: string;
  store: { ok: boolean; backend: "local" | "firestore" };
  /**
   * Persistence-layer telemetry from the in-memory cache flusher.
   * Surfaced here so external monitoring (Datadog agent, GCP uptime check) can
   * scrape `consecutiveFlushFailures` and `lastFlushAt` without an admin token.
   * No user data is exposed — only counters and timestamps.
   */
  persistence: PersistenceHealthMetrics;
  todosDrift: TodosDriftStatus;
}

/**
 * Readiness: verifies the process can talk to its persistence layer (Firestore or local).
 * Use GET /health/ready — returns 503 when store is unreachable (e.g. Firestore down).
 *
 * Also downgrades to "degraded" (→ 503) when the persistence layer has had at
 * least one consecutive flush failure: that's the exact state that produced
 * the May 2026 "Meeting FTB" drift (writes accepted in memory but never
 * landed in Firestore). Forcing a 503 there means Cloud Run / Datadog will
 * raise an incident long before a user notices missing data.
 */
export async function getReadinessStatus(): Promise<ReadinessStatus> {
  const store = await pingDatastore();
  const persistence = getPersistenceMetrics();
  const todosDrift = getTodosDriftStatus();
  const driftHealthy =
    todosDrift.status !== "drift"
    && todosDrift.status !== "error";
  const ok = store.ok && persistence.consecutiveFlushFailures === 0 && driftHealthy;
  return {
    status: ok ? "ok" : "degraded",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    store,
    persistence,
    todosDrift,
  };
}
