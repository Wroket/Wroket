import { capture } from "./api";
import { getAuth } from "./storage";
import { getActiveTabClip } from "./tabContext";

const MENU_TASK = "wroket-capture-task";
const MENU_NOTE = "wroket-capture-note";
const MENU_PAGE = "wroket-capture-page";

function t(key: string): string {
  return chrome.i18n.getMessage(key) || key;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_PAGE,
      title: t("menuCapturePage"),
      contexts: ["page"],
    });
    chrome.contextMenus.create({
      id: MENU_TASK,
      title: t("menuCaptureTask"),
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: MENU_NOTE,
      title: t("menuCaptureNote"),
      contexts: ["selection"],
    });
  });
});

async function quickCapture(kind: "task" | "note", selectionOverride?: string): Promise<void> {
  const auth = await getAuth();
  if (!auth) {
    await chrome.action.openPopup().catch(() => undefined);
    return;
  }
  const ctx = await getActiveTabClip();
  if (!/^https?:/i.test(ctx.url)) {
    console.warn("[wroket] unsupported URL");
    return;
  }
  const excerpt = (selectionOverride ?? ctx.selection).trim();
  const title = (excerpt || ctx.title || ctx.url).slice(0, 500);
  const clientId = crypto.randomUUID();
  try {
    const result = await capture({
      clientId,
      kind,
      title,
      content: kind === "note" ? excerpt || ctx.title : undefined,
      source: {
        url: ctx.url.slice(0, 2000),
        title: ctx.title.slice(0, 500) || undefined,
        excerpt: excerpt || undefined,
        via: "chrome_ext",
      },
    });
    if (result.openUrl) {
      await chrome.tabs.create({ url: result.openUrl });
    }
  } catch (e) {
    console.error("[wroket] capture failed", e);
    await chrome.action.openPopup().catch(() => undefined);
  }
}

chrome.contextMenus.onClicked.addListener((info) => {
  const selection = info.selectionText?.trim();
  if (info.menuItemId === MENU_NOTE) void quickCapture("note", selection);
  else if (info.menuItemId === MENU_TASK || info.menuItemId === MENU_PAGE) {
    void quickCapture("task", selection);
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "capture-selection") void quickCapture("task");
});
