import { getStore } from "../persistence";
import { countTodosV2ByOwner } from "./todoDocStore";

let timer: NodeJS.Timeout | null = null;

async function checkOnce(): Promise<void> {
  const mode = (process.env.TODOS_STORAGE_MODE ?? "legacy").trim().toLowerCase();
  if (mode === "legacy") return;

  const legacy = (getStore().todos ?? {}) as Record<string, Record<string, unknown>>;
  const v2 = await countTodosV2ByOwner();
  const owners = new Set<string>([...Object.keys(legacy), ...v2.keys()]);

  let driftOwners = 0;
  for (const owner of owners) {
    const a = Object.keys(legacy[owner] ?? {}).length;
    const b = v2.get(owner) ?? 0;
    if (a !== b) driftOwners += 1;
  }
  if (driftOwners > 0) {
    console.error("[todos-drift] driftOwners=%d owners=%d", driftOwners, owners.size);
  } else {
    console.log("[todos-drift] ok owners=%d", owners.size);
  }
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
