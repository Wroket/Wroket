import fs from "fs";
import path from "path";

type Firestore = import("@google-cloud/firestore").Firestore;

const USE_LOCAL = process.env.USE_LOCAL_STORE === "true";
const STORE_PATH = path.join(__dirname, "..", "data", "local-store.json");

const DOMAINS = [
  "users", "todos", "notifications", "collaborators",
  "teams", "projects", "sessions", "webhooks", "inviteLog", "comments", "notes",
] as const;

type Domain = (typeof DOMAINS)[number];

export interface StoreData {
  users?: Record<string, unknown>;
  todos?: Record<string, Record<string, unknown>>;
  notifications?: Record<string, unknown[]>;
  collaborators?: Record<string, unknown[]>;
  teams?: Record<string, unknown>;
  projects?: Record<string, unknown>;
  sessions?: Record<string, unknown>;
  webhooks?: Record<string, unknown[]>;
  inviteLog?: unknown[];
  comments?: Record<string, unknown[]>;
  notes?: Record<string, Record<string, unknown>>;
}

let cachedStore: StoreData = {};
let db: Firestore | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const dirtyDomains = new Set<Domain>();

function loadFromDisk(): StoreData {
  try {
    if (!fs.existsSync(STORE_PATH)) return {};
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf-8")) as StoreData;
  } catch (err) {
    console.warn("[persistence] Cannot load %s: %s", STORE_PATH, err);
    return {};
  }
}

function saveToDisk(): void {
  try {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(cachedStore, null, 2), "utf-8");
  } catch (err) {
    console.error("[persistence] Cannot save to disk: %s", err);
  }
}

async function loadFromFirestore(): Promise<StoreData> {
  if (!db) return {};
  const store: StoreData = {};
  const snapshots = await Promise.all(
    DOMAINS.map((d) => db!.collection("store").doc(d).get())
  );
  for (let i = 0; i < DOMAINS.length; i++) {
    const snap = snapshots[i];
    if (snap.exists) {
      (store as Record<string, unknown>)[DOMAINS[i]] = snap.data()!.data;
    }
  }
  return store;
}

async function saveToFirestore(): Promise<void> {
  if (!db || dirtyDomains.size === 0) return;
  const batch = db.batch();
  for (const domain of dirtyDomains) {
    const ref = db.collection("store").doc(domain);
    const data = (cachedStore as Record<string, unknown>)[domain];
    if (data !== undefined) {
      batch.set(ref, { data });
    }
  }
  dirtyDomains.clear();
  try {
    await batch.commit();
  } catch (err) {
    console.error("[persistence] Firestore batch save failed: %s", err);
  }
}

/**
 * Loads the store from Firestore or disk depending on config.
 * Must be awaited before any service hydration.
 */
export async function initStore(): Promise<void> {
  if (USE_LOCAL) {
    cachedStore = loadFromDisk();
    console.log("[persistence] Loaded from local JSON file");
  } else {
    try {
      const { Firestore: FirestoreClass } = await import("@google-cloud/firestore");
      db = new FirestoreClass({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
      cachedStore = await loadFromFirestore();
      console.log("[persistence] Loaded from Firestore");
    } catch (err) {
      console.error("[persistence] Firestore init failed, starting with empty store:", err);
      db = null;
      cachedStore = {};
    }
  }
}

export function getStore(): StoreData {
  return cachedStore;
}

/**
 * Marks a domain as dirty and schedules a debounced write.
 * Optionally pass the domain name for granular Firestore batches.
 */
export function scheduleSave(domain?: Domain): void {
  if (domain) {
    dirtyDomains.add(domain);
  } else {
    DOMAINS.forEach((d) => {
      if ((cachedStore as Record<string, unknown>)[d] !== undefined) {
        dirtyDomains.add(d);
      }
    });
  }

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (USE_LOCAL) {
      saveToDisk();
    } else {
      saveToFirestore().catch((err) =>
        console.error("[persistence] Async save error: %s", err)
      );
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
