import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

import { initStore, getStore } from "../persistence";
import { countTodosV2ByOwner } from "../services/todoDocStore";

async function main(): Promise<void> {
  await initStore();
  const legacy = (getStore().todos ?? {}) as Record<string, Record<string, unknown>>;
  const v2Counts = await countTodosV2ByOwner();

  const owners = new Set<string>([...Object.keys(legacy), ...v2Counts.keys()]);
  let driftOwners = 0;
  let legacyTotal = 0;
  let v2Total = 0;
  for (const owner of owners) {
    const legacyCount = Object.keys(legacy[owner] ?? {}).length;
    const v2Count = v2Counts.get(owner) ?? 0;
    legacyTotal += legacyCount;
    v2Total += v2Count;
    if (legacyCount !== v2Count) {
      driftOwners += 1;
      console.log("[drift] owner=%s legacy=%d v2=%d", owner, legacyCount, v2Count);
    }
  }

  console.log(
    "[drift] owners=%d driftOwners=%d legacyTotal=%d v2Total=%d",
    owners.size,
    driftOwners,
    legacyTotal,
    v2Total,
  );

  if (driftOwners > 0 || legacyTotal !== v2Total) {
    process.exit(3);
  }
}

main().catch((err) => {
  console.error("[drift] fatal:", err);
  process.exit(99);
});
