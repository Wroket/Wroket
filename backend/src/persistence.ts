import fs from "fs";
import path from "path";

const STORE_PATH = path.join(__dirname, "..", "data", "local-store.json");

interface StoreData {
  users?: Record<string, unknown>;
  todos?: Record<string, Record<string, unknown>>;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Charge les données depuis le fichier JSON local.
 * Retourne un objet vide si le fichier n'existe pas.
 */
export function loadStore(): StoreData {
  try {
    if (!fs.existsSync(STORE_PATH)) return {};
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    return JSON.parse(raw) as StoreData;
  } catch (err) {
    console.warn("[persistence] Impossible de charger %s: %s", STORE_PATH, err);
    return {};
  }
}

/**
 * Sauvegarde les données dans le fichier JSON local (debounce 500ms).
 */
export function saveStore(data: StoreData): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    try {
      const dir = path.dirname(STORE_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      console.error("[persistence] Impossible de sauvegarder: %s", err);
    }
  }, 500);
}
