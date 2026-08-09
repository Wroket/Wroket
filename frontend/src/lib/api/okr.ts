import { API_BASE_URL, apiFetchDefaults, parseJsonOrThrow, extractApiMessage } from "./core";

export interface OkrKeyResult {
  id: string;
  title: string;
  target: number;
  current: number;
  unit: string | null;
  linkedTodoIds: string[];
  linkedProjectIds: string[];
}

export interface OkrObjective {
  id: string;
  ownerUid: string;
  teamId: string | null;
  title: string;
  description: string;
  status: string;
  keyResults: OkrKeyResult[];
  progressPercent?: number;
  createdAt: string;
  updatedAt: string;
}

export async function listOkrs(): Promise<OkrObjective[]> {
  const res = await fetch(`${API_BASE_URL}/okr`, { ...apiFetchDefaults, method: "GET" });
  if (!res.ok) throw new Error("Impossible de charger les OKR");
  const data = (await res.json()) as { okrs: OkrObjective[] };
  return data.okrs;
}

export async function createOkr(body: {
  title: string;
  description?: string;
  keyResults?: Partial<OkrKeyResult>[];
}): Promise<OkrObjective> {
  const res = await fetch(`${API_BASE_URL}/okr`, {
    ...apiFetchDefaults,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(err, "Impossible de créer l'OKR"));
  }
  return res.json() as Promise<OkrObjective>;
}

export async function refreshOkr(id: string): Promise<OkrObjective> {
  const res = await fetch(`${API_BASE_URL}/okr/${encodeURIComponent(id)}/refresh`, {
    ...apiFetchDefaults,
    method: "POST",
  });
  if (!res.ok) throw new Error("Refresh failed");
  return res.json() as Promise<OkrObjective>;
}

export async function deleteOkr(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/okr/${encodeURIComponent(id)}`, {
    ...apiFetchDefaults,
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) throw new Error("Delete failed");
}
