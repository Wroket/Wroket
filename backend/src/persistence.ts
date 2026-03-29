import fs from "fs";
import path from "path";

const STORE_PATH = path.join(__dirname, "..", "data", "local-store.json");

export interface StoreData {
  users?: Record<string, unknown>;
  todos?: Record<string, Record<string, unknown>>;
  notifications?: Record<string, unknown[]>;
  collaborators?: Record<string, unknown[]>;
  teams?: Record<string, unknown>;
  projects?: Record<string, unknown>;
  sessions?: Record<string, unknown>;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function loadStoreFromDisk(): StoreData {
  try {
    if (!fs.existsSync(STORE_PATH)) return {};
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    return JSON.parse(raw) as StoreData;
  } catch (err) {
    console.warn("[persistence] Impossible de charger %s: %s", STORE_PATH, err);
    return {};
  }
}

let cachedStore: StoreData = loadStoreFromDisk();

/**
 * (Re)loads the store from disk into the in-memory cache.
 * Call once at startup before any request handling.
 */
export function initStore(): void {
  cachedStore = loadStoreFromDisk();
}

/**
 * Returns the single in-memory cached store.
 * All services read from and write to this object.
 */
export function getStore(): StoreData {
  return cachedStore;
}

/**
 * Schedules a debounced write of the cached store to disk (500 ms).
 */
export function scheduleSave(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    try {
      const dir = path.dirname(STORE_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(STORE_PATH, JSON.stringify(cachedStore, null, 2), "utf-8");
    } catch (err) {
      console.error("[persistence] Impossible de sauvegarder: %s", err);
    }
  }, 500);
}

/** @deprecated Use getStore() instead */
export function loadStore(): StoreData {
  return cachedStore;
}

/** @deprecated Use scheduleSave() instead */
export function saveStore(_data: StoreData): void {
  scheduleSave();
}
