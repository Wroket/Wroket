export interface StoredAuth {
  token: string;
  keyId?: string;
  email?: string;
  connectedAt?: string;
}

export interface CaptureDraft {
  title: string;
  kind: "task" | "note";
  projectId: string | null;
  priority: "low" | "medium" | "high";
  deadline: string | null;
  sourceUrl: string;
  sourceTitle?: string;
  excerpt?: string;
  savedAt: number;
}

const AUTH_KEY = "extAuth";
const LAST_PROJECT_KEY = "lastProjectId";
const DRAFT_KEY = "captureDraft";

export async function getAuth(): Promise<StoredAuth | null> {
  const data = await chrome.storage.local.get(AUTH_KEY);
  const auth = data[AUTH_KEY] as StoredAuth | undefined;
  if (!auth?.token) return null;
  return auth;
}

export async function setAuth(auth: StoredAuth): Promise<void> {
  await chrome.storage.local.set({ [AUTH_KEY]: auth });
}

export async function clearAuth(): Promise<void> {
  await chrome.storage.local.remove(AUTH_KEY);
}

export async function getLastProjectId(): Promise<string | null> {
  const data = await chrome.storage.local.get(LAST_PROJECT_KEY);
  return typeof data[LAST_PROJECT_KEY] === "string" ? data[LAST_PROJECT_KEY] : null;
}

export async function setLastProjectId(id: string | null): Promise<void> {
  if (!id) await chrome.storage.local.remove(LAST_PROJECT_KEY);
  else await chrome.storage.local.set({ [LAST_PROJECT_KEY]: id });
}

export async function saveDraft(draft: CaptureDraft): Promise<void> {
  await chrome.storage.session.set({ [DRAFT_KEY]: draft });
}

export async function loadDraft(): Promise<CaptureDraft | null> {
  const data = await chrome.storage.session.get(DRAFT_KEY);
  return (data[DRAFT_KEY] as CaptureDraft | undefined) ?? null;
}

export async function clearDraft(): Promise<void> {
  await chrome.storage.session.remove(DRAFT_KEY);
}
