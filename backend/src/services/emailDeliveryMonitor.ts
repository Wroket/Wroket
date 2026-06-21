/**
 * Tracks outbound SMTP delivery in a 1 h sliding window and raises admin ops
 * alerts when failure rate is high (prod only, via adminOpsAlertService).
 */

const WINDOW_MS = 60 * 60 * 1000;
const MIN_FAILURES_NO_SUCCESS = 3;
const MIN_ATTEMPTS_HIGH_FAILURE_RATE = 5;
const MAX_SUCCESS_RATIO = 0.2;

let successTimestamps: number[] = [];
let failureTimestamps: number[] = [];

function trimWindow(timestamps: number[], now: number): number[] {
  const cutoff = now - WINDOW_MS;
  return timestamps.filter((t) => t >= cutoff);
}

function windowStats(now: number): { successes: number; failures: number } {
  successTimestamps = trimWindow(successTimestamps, now);
  failureTimestamps = trimWindow(failureTimestamps, now);
  return { successes: successTimestamps.length, failures: failureTimestamps.length };
}

/** Call after a successful outbound send when SMTP is configured. */
export function recordEmailDeliverySuccess(): void {
  successTimestamps.push(Date.now());
}

/** Call after a failed outbound send when SMTP is configured. */
export function recordEmailDeliveryFailure(_err?: unknown): void {
  failureTimestamps.push(Date.now());
  void maybeNotifySmtpDegraded();
}

/** Periodic probe from adminOpsAlertMonitor (same thresholds, no extra failures required). */
export function probeSmtpDeliveryHealth(): void {
  void maybeNotifySmtpDegraded();
}

async function maybeNotifySmtpDegraded(): Promise<void> {
  const now = Date.now();
  const { successes, failures } = windowStats(now);
  if (failures === 0) return;

  let detail: string | null = null;
  if (failures >= MIN_FAILURES_NO_SUCCESS && successes === 0) {
    detail = `${failures} échec(s) SMTP en 1 h, aucun envoi réussi.`;
  } else {
    const attempts = failures + successes;
    if (attempts >= MIN_ATTEMPTS_HIGH_FAILURE_RATE && successes / attempts < MAX_SUCCESS_RATIO) {
      detail = `Taux d'échec SMTP élevé : ${failures} échecs, ${successes} succès (1 h).`;
    }
  }
  if (!detail) return;

  const { maybeNotifyAdminOpsAlert } = await import("./adminOpsAlertService");
  maybeNotifyAdminOpsAlert({
    kind: "smtp_degraded",
    title: "SMTP dégradé — emails transactionnels en échec",
    lines: [
      detail,
      "Vérifier SMTP_HOST, identifiants et quotas Gmail / Workspace.",
      "Les alertes ops et emails utilisateurs (vérif, reset, invites) peuvent être affectés.",
    ],
  });
}

/** Test helper — record failure without raising an alert (for probe tests). */
export function _recordEmailDeliveryFailureForTests(): void {
  failureTimestamps.push(Date.now());
}

/** Test helper — reset sliding-window counters. */
export function _resetEmailDeliveryStatsForTests(): void {
  successTimestamps = [];
  failureTimestamps = [];
}
