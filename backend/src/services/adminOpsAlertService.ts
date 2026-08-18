/**
 * Email alerts to ADMIN_EMAILS when production ops checks fail.
 * Cooldown is in-memory per Cloud Run instance (see ADMIN_OPS_ALERT_COOLDOWN_MINUTES).
 */

import { getAdminEmails } from "./adminService";
import { isSmtpConfiguredForOutbound, sendAdminOpsAlertEmail } from "./emailService";
import type { PersistenceHealthMetrics } from "./healthService";

export type AdminOpsAlertKind =
  | "persistence_flush"
  | "persistence_flush_stale"
  | "todos_drift"
  | "firestore_unreachable"
  | "smtp_degraded";

export interface AdminOpsAlertPayload {
  kind: AdminOpsAlertKind;
  title: string;
  lines: string[];
}

const lastSentAtMs = new Map<AdminOpsAlertKind, number>();

function alertsEnabled(): boolean {
  if (process.env.ADMIN_OPS_ALERTS_ENABLED === "false") return false;
  if (process.env.USE_LOCAL_STORE === "true") return false;
  if (process.env.NODE_ENV !== "production") return false;
  return true;
}

function cooldownMs(): number {
  const minutes = Number(process.env.ADMIN_OPS_ALERT_COOLDOWN_MINUTES);
  if (Number.isFinite(minutes) && minutes > 0) return minutes * 60 * 1000;
  return 60 * 60 * 1000;
}

/**
 * Fire-and-forget admin email when an ops incident is detected.
 * At most one email per `kind` per cooldown window (per instance).
 */
export function maybeNotifyAdminOpsAlert(payload: AdminOpsAlertPayload): void {
  if (!alertsEnabled()) return;
  if (!isSmtpConfiguredForOutbound()) {
    console.warn("[adminOpsAlert] SMTP not configured — skipping alert: %s", payload.kind);
    return;
  }
  const recipients = getAdminEmails();
  if (recipients.length === 0) {
    console.warn("[adminOpsAlert] ADMIN_EMAILS empty — skipping alert: %s", payload.kind);
    return;
  }

  const now = Date.now();
  const last = lastSentAtMs.get(payload.kind) ?? 0;
  if (now - last < cooldownMs()) return;
  lastSentAtMs.set(payload.kind, now);

  void sendAdminOpsAlertEmail(recipients, payload.title, payload.lines).catch((err) => {
    console.error("[adminOpsAlert] failed to send %s alert: %s", payload.kind, err);
  });
}

let monitorTimer: ReturnType<typeof setInterval> | null = null;

/** Periodic readiness probe for Firestore reachability (flush/drift have dedicated hooks). */
export function startAdminOpsAlertMonitor(): void {
  if (monitorTimer || !alertsEnabled()) return;
  const minutes = Number(process.env.ADMIN_OPS_ALERT_CHECK_MINUTES);
  const intervalMs = (Number.isFinite(minutes) && minutes > 0 ? minutes : 15) * 60 * 1000;
  monitorTimer = setInterval(() => {
    void runReadinessProbe().catch((err) => {
      console.error("[adminOpsAlert] readiness probe failed:", err);
    });
  }, intervalMs);
  monitorTimer.unref();
}

export function stopAdminOpsAlertMonitor(): void {
  if (!monitorTimer) return;
  clearInterval(monitorTimer);
  monitorTimer = null;
}

/**
 * True when dirty data has been continuously non-empty longer than `staleMs`.
 * Uses `dirtyAgeMs` (time since dirty became non-empty), not `lastFlushAt`
 * (which stays old during quiet periods and caused false positives).
 */
export function isPersistenceFlushStale(
  persistence: Pick<
    PersistenceHealthMetrics,
    "dirtyDomainsCount" | "dirtyShardsCount" | "dirtyAgeMs" | "consecutiveFlushFailures"
  >,
  staleMs: number,
): boolean {
  const dirtyTotal = persistence.dirtyDomainsCount + persistence.dirtyShardsCount;
  if (dirtyTotal <= 0) return false;
  if (persistence.consecutiveFlushFailures > 0) return false;
  const ageMs = persistence.dirtyAgeMs;
  if (ageMs === null || !Number.isFinite(ageMs)) return false;
  return ageMs > staleMs;
}

function flushStaleThresholdMs(): number {
  const staleMinutes = Number(process.env.ADMIN_OPS_FLUSH_STALE_MINUTES);
  return (Number.isFinite(staleMinutes) && staleMinutes > 0 ? staleMinutes : 10) * 60 * 1000;
}

async function runReadinessProbe(): Promise<void> {
  const { probeSmtpDeliveryHealth } = await import("./emailDeliveryMonitor");
  probeSmtpDeliveryHealth();

  const { getReadinessStatus } = await import("./healthService");
  const status = await getReadinessStatus();
  const p = status.persistence;
  const staleMs = flushStaleThresholdMs();

  if (isPersistenceFlushStale(p, staleMs) && status.store.ok) {
    const ageMin = p.dirtyAgeMs === null ? "?" : Math.round(p.dirtyAgeMs / 60_000);
    maybeNotifyAdminOpsAlert({
      kind: "persistence_flush_stale",
      title: "Flush Firestore stale — données dirty non persistées",
      lines: [
        `Domaines/shards dirty : ${p.dirtyDomainsCount} domaines, ${p.dirtyShardsCount} shards todos`,
        `Dirty depuis : ${p.dirtySince ?? "inconnu"} (~${ageMin} min)`,
        `Dernier flush réussi : ${p.lastFlushAt ?? "jamais"}`,
        `Seuil stale : ${Math.round(staleMs / 60_000)} min (âge du dirty, pas du dernier flush)`,
        "Aucun échec flush consécutif pour l'instant — risque de dégradation silencieuse.",
      ],
    });
  }

  if (status.status !== "degraded") return;

  if (status.persistence.consecutiveFlushFailures > 0) return;
  if (status.todosDrift.status === "drift" || status.todosDrift.status === "error") return;
  if (status.store.ok) return;

  maybeNotifyAdminOpsAlert({
    kind: "firestore_unreachable",
    title: "Firestore injoignable (readiness)",
    lines: [
      "L'API ne parvient pas à lire le document store/users.",
      "Les requêtes /health/ready renvoient HTTP 503.",
      "Vérifier IAM du service account wroket-run, quotas Firestore et Cloud Logging.",
    ],
  });
}

/** Test helper — reset cooldown state. */
export function _resetAdminOpsAlertCooldownForTests(): void {
  lastSentAtMs.clear();
}
