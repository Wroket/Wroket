import { API_BASE_URL } from "./core";

export type WebhookEvent =
  | "task_assigned"
  | "task_completed"
  | "task_declined"
  | "task_accepted"
  | "team_invite"
  | "deadline_approaching";

export type WebhookPlatform = "slack" | "discord" | "teams" | "custom";

export interface WebhookConfig {
  id: string;
  label: string;
  url: string;
  platform: WebhookPlatform;
  events: WebhookEvent[];
  enabled: boolean;
  createdAt: string;
}

export async function getWebhooks(): Promise<WebhookConfig[]> {
  const res = await fetch(`${API_BASE_URL}/webhooks`, { credentials: "include" });
  if (!res.ok) throw new Error("Impossible de charger les webhooks");
  return res.json();
}

export async function saveWebhook(config: Partial<WebhookConfig> & { url: string }): Promise<WebhookConfig> {
  const res = await fetch(`${API_BASE_URL}/webhooks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
    credentials: "include",
  });
  if (!res.ok) throw new Error("Erreur lors de la sauvegarde du webhook");
  return res.json();
}

export async function deleteWebhookApi(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/webhooks/${id}`, { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error("Impossible de supprimer le webhook");
}

export async function testWebhookApi(url: string, platform: WebhookPlatform): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/webhooks/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, platform }),
    credentials: "include",
  });
  if (!res.ok) return false;
  const data = await res.json();
  return data.success === true;
}
