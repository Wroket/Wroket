/** Production defaults — override via chrome.storage.local for local API smoke. */
export const DEFAULT_API_BASE = "https://api.wroket.com";
export const DEFAULT_WEB_BASE = "https://wroket.com";
export const EXT_VERSION = "0.1.0";
export const CLIENT_HEADER = `chrome-ext/${EXT_VERSION}`;

export interface ExtConfig {
  apiBase: string;
  webBase: string;
}

export async function getConfig(): Promise<ExtConfig> {
  const stored = await chrome.storage.local.get(["apiBase", "webBase"]);
  return {
    apiBase: typeof stored.apiBase === "string" && stored.apiBase ? stored.apiBase : DEFAULT_API_BASE,
    webBase: typeof stored.webBase === "string" && stored.webBase ? stored.webBase : DEFAULT_WEB_BASE,
  };
}
