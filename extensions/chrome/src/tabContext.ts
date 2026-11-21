export interface TabClipContext {
  url: string;
  title: string;
  selection: string;
}

/**
 * Prefer a normal web tab. If the focused tab is this extension's popup
 * opened as a full page, fall back to another http(s) tab in the window.
 */
async function resolveTargetTab(): Promise<chrome.tabs.Tab | undefined> {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  const selfOrigin = `chrome-extension://${chrome.runtime.id}`;
  const isSelfUi = !!active?.url?.startsWith(selfOrigin);

  if (active && !isSelfUi) return active;

  const tabs = await chrome.tabs.query({ currentWindow: true });
  const httpsTab = tabs.find(
    (t) => t.id !== active?.id && !!t.url && /^https?:/i.test(t.url),
  );
  return httpsTab ?? active;
}

/** Read active tab URL/title + selection (requires activeTab). */
export async function getActiveTabClip(): Promise<TabClipContext> {
  const tab = await resolveTargetTab();
  const url = tab?.url ?? "";
  const title = tab?.title ?? "";
  let selection = "";
  if (tab?.id != null && /^https?:/i.test(url)) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.getSelection()?.toString() ?? "",
      });
      selection = String(results[0]?.result ?? "").trim();
    } catch {
      selection = "";
    }
  }
  return { url, title, selection: selection.slice(0, 1000) };
}

/** Hostname for display, or empty if not a web URL. */
export function sourceHost(url: string): string {
  try {
    if (!/^https?:/i.test(url)) return "";
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function isSupportedClipUrl(url: string): boolean {
  return /^https?:/i.test(url);
}
