import { Request, Response } from "express";

import { getHealthStatus, getReadinessStatus } from "../services/healthService";

export const getRoot = (_req: Request, res: Response): void => {
  res.status(200).json({ message: "Wroket backend is running" });
};

/** Liveness: process up, no I/O — for cheap uptime checks and Cloud Run default probes. */
export const getHealth = (_req: Request, res: Response): void => {
  res.status(200).json(getHealthStatus());
};

/** Readiness: datastore reachable — prefer for alerting when Firestore fails. */
export const getReady = async (_req: Request, res: Response): Promise<void> => {
  try {
    const body = await getReadinessStatus();
    res.status(body.status === "ok" ? 200 : 503).json(body);
  } catch (err) {
    console.error("[health] ready check failed:", err);
    res.status(503).json({
      status: "degraded",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      store: { ok: false, backend: "firestore" as const },
    });
  }
};

