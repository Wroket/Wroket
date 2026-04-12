import { pingDatastore } from "../persistence";

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

export interface ReadinessStatus {
  status: "ok" | "degraded";
  uptime: number;
  timestamp: string;
  store: { ok: boolean; backend: "local" | "firestore" };
}

/**
 * Readiness: verifies the process can talk to its persistence layer (Firestore or local).
 * Use GET /health/ready — returns 503 when store is unreachable (e.g. Firestore down).
 */
export async function getReadinessStatus(): Promise<ReadinessStatus> {
  const store = await pingDatastore();
  const ok = store.ok;
  return {
    status: ok ? "ok" : "degraded",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    store,
  };
}
