import { getStore } from "../persistence";
import { countTodosV2ByOwner, loadAllTodosV2ByOwner } from "./todoDocStore";
import { getInMemoryTodoIdsByOwner } from "./todoService";

let timer: NodeJS.Timeout | null = null;

/**
 * Hourly drift check between the in-memory todo map and `todos_v2`.
 *
 * Source of the "legacy" snapshot depends on `TODOS_STORAGE_MODE`:
 * - `dual`: read from `getStore().todos` — the legacy persistence map that
 *   `persistTodos` flushes to `store/todos_{shard}` docs. That's the same
 *   map the frontend reads from in dual mode, so monitoring it vs `todos_v2`
 *   catches the exact May 2026 "Meeting FTB invisible" failure mode.
 * - `v2`: read from `todosByUser` — the in-memory map populated by
 *   `hydrateTodosFromV2IfNeeded` at boot. In v2 mode `getStore().todos` is
 *   intentionally never populated, so comparing against it would emit a
 *   permanent false-positive drift equal to the user's entire v2 footprint.
 *
 * Why structured JSON: Cloud Logging parses `jsonPayload` for alert policies.
 * Emitting a stable `event:"todos-drift"` line with per-owner missing-id
 * counts lets us alert as soon as a single row is missing in either direction.
 * The worst-offender uid is kept so an operator can rerun
 * `reconcileLegacyV2Drift.ts --uid <uid>` immediately.
 */
async function checkOnce(): Promise<void> {
  const mode = (process.env.TODOS_STORAGE_MODE ?? "legacy").trim().toLowerCase();
  if (mode === "legacy") return;

  const inMemoryIdsByOwner: Record<string, string[]> =
    mode === "v2"
      ? getInMemoryTodoIdsByOwner()
      : Object.fromEntries(
          Object.entries((getStore().todos ?? {}) as Record<string, Record<string, unknown>>).map(
            ([uid, m]) => [uid, Object.keys(m)],
          ),
        );

  // Counts first (cheap) — if no count drift, skip the per-id scan.
  const v2Counts = await countTodosV2ByOwner();
  const owners = new Set<string>([...Object.keys(inMemoryIdsByOwner), ...v2Counts.keys()]);

  let countDriftOwners = 0;
  for (const owner of owners) {
    if ((inMemoryIdsByOwner[owner]?.length ?? 0) !== (v2Counts.get(owner) ?? 0)) countDriftOwners += 1;
  }
  if (countDriftOwners === 0) {
    console.log(JSON.stringify({ event: "todos-drift", status: "ok", owners: owners.size, source: mode }));
    return;
  }

  // Drift suspected — load full id sets to identify direction + worst offender.
  const v2Full = await loadAllTodosV2ByOwner();
  let v2OnlyTotal = 0;
  let inMemoryOnlyTotal = 0;
  let worst: { uid: string; v2Only: number; inMemoryOnly: number } | null = null;
  for (const owner of owners) {
    const inMemoryIds = new Set(inMemoryIdsByOwner[owner] ?? []);
    const v2Ids = new Set(Object.keys(v2Full[owner] ?? {}));
    let v2Only = 0;
    let inMemoryOnly = 0;
    for (const id of v2Ids) if (!inMemoryIds.has(id)) v2Only += 1;
    for (const id of inMemoryIds) if (!v2Ids.has(id)) inMemoryOnly += 1;
    v2OnlyTotal += v2Only;
    inMemoryOnlyTotal += inMemoryOnly;
    const score = v2Only + inMemoryOnly;
    if (score > 0 && (!worst || score > worst.v2Only + worst.inMemoryOnly)) {
      worst = { uid: owner, v2Only, inMemoryOnly };
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
      // Keep the legacy field name for backwards-compat with the existing
      // alert log-based metric / dashboards; semantically it's now
      // "present in memory but missing in v2" (was "legacy shard only").
      legacyOnlyTotal: inMemoryOnlyTotal,
      worstOwner: worst,
      source: mode,
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
