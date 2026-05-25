import { getStore } from "../persistence";
import { countTodosV2ByOwner, loadAllTodosV2ByOwner } from "./todoDocStore";

let timer: NodeJS.Timeout | null = null;

/**
 * Hourly drift check between the legacy in-memory todo map and `todos_v2`.
 *
 * Why structured JSON: Cloud Logging parses `jsonPayload` for alert policies.
 * Emitting a stable `event:"todos-drift"` line with per-owner missing-id
 * counts lets us alert as soon as a single row is missing in either direction
 * — which is the exact failure mode that produced the May 2026 "Meeting FTB
 * invisible" drift. The full id lists are kept for the most-impacted owner so
 * an operator can rerun `reconcileLegacyV2Drift.ts --uid <uid>` immediately.
 */
async function checkOnce(): Promise<void> {
  const mode = (process.env.TODOS_STORAGE_MODE ?? "legacy").trim().toLowerCase();
  if (mode === "legacy") return;

  const legacy = (getStore().todos ?? {}) as Record<string, Record<string, unknown>>;
  // Counts first (cheap) — if no count drift, skip the per-id scan.
  const v2Counts = await countTodosV2ByOwner();
  const owners = new Set<string>([...Object.keys(legacy), ...v2Counts.keys()]);

  let countDriftOwners = 0;
  for (const owner of owners) {
    if (Object.keys(legacy[owner] ?? {}).length !== (v2Counts.get(owner) ?? 0)) countDriftOwners += 1;
  }
  if (countDriftOwners === 0) {
    console.log(JSON.stringify({ event: "todos-drift", status: "ok", owners: owners.size }));
    return;
  }

  // Drift suspected — load full id sets to identify direction + worst offender.
  const v2Full = await loadAllTodosV2ByOwner();
  let v2OnlyTotal = 0;
  let legacyOnlyTotal = 0;
  let worst: { uid: string; v2Only: number; legacyOnly: number } | null = null;
  for (const owner of owners) {
    const legacyIds = new Set(Object.keys(legacy[owner] ?? {}));
    const v2Ids = new Set(Object.keys(v2Full[owner] ?? {}));
    let v2Only = 0;
    let legacyOnly = 0;
    for (const id of v2Ids) if (!legacyIds.has(id)) v2Only += 1;
    for (const id of legacyIds) if (!v2Ids.has(id)) legacyOnly += 1;
    v2OnlyTotal += v2Only;
    legacyOnlyTotal += legacyOnly;
    const score = v2Only + legacyOnly;
    if (score > 0 && (!worst || score > worst.v2Only + worst.legacyOnly)) {
      worst = { uid: owner, v2Only, legacyOnly };
    }
  }

  console.error(
    JSON.stringify({
      event: "todos-drift",
      status: "drift",
      severity: "ERROR",
      owners: owners.size,
      countDriftOwners,
      v2OnlyTotal,
      legacyOnlyTotal,
      worstOwner: worst,
      hint: "Run RUN_MIGRATION=reconcile_legacy_v2 npx ts-node backend/src/scripts/reconcileLegacyV2Drift.ts --uid <uid> (or --all)",
    }),
  );
}

export function startTodosDriftMonitor(): void {
  if (timer) return;
  timer = setInterval(() => {
    void checkOnce().catch((err) => console.error("[todos-drift] check failed:", err));
  }, 60 * 60 * 1000);
  timer.unref();
  void checkOnce().catch((err) => console.error("[todos-drift] initial check failed:", err));
}

export function stopTodosDriftMonitor(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
