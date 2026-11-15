export interface TabClipContext {
  url: string;
  title: string;
  selection: string;
}

/** Read active tab URL/title + selection (requires activeTab). */
export async function getActiveTabClip(): Promise<TabClipContext> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
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
