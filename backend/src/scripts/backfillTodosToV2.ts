import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

import { initStore } from "../persistence";
import { getStore } from "../persistence";
import { syncAllTodosToConfiguredStores } from "../services/todoService";

async function main(): Promise<void> {
  const mode = (process.env.TODOS_STORAGE_MODE ?? "legacy").trim().toLowerCase();
  if (mode === "legacy") {
    console.error("[backfill-v2] TODOS_STORAGE_MODE=legacy. Use dual or v2 to write todos_v2.");
    process.exit(2);
  }
  await initStore();
  const legacy = (getStore().todos ?? {}) as Record<string, Record<string, unknown>>;
  const owners = Object.keys(legacy);
  const total = owners.reduce((acc, uid) => acc + Object.keys(legacy[uid] ?? {}).length, 0);
  console.log("[backfill-v2] legacy owners=%d todos=%d", owners.length, total);
  await syncAllTodosToConfiguredStores();
  console.log("[backfill-v2] Sync completed from in-memory legacy source to todos_v2.");
}

main().catch((err) => {
  console.error("[backfill-v2] fatal:", err);
  process.exit(99);
});
