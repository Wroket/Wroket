import { API_BASE_URL } from "./core";

export async function getVapidPublicKey(): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/push/vapid-public-key`, { credentials: "include" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { message?: string }).message || "Web Push indisponible");
  }
  const key = (body as { publicKey?: unknown }).publicKey;
  if (typeof key !== "string" || !key) throw new Error("Clé VAPID invalide");
  return key;
}

export async function subscribePush(subscription: PushSubscriptionJSON): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/push/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ subscription }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message || "Abonnement push échoué");
  }
}

export async function unsubscribePush(endpoint?: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/push/subscribe`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(endpoint ? { endpoint } : {}),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message || "Désabonnement push échoué");
  }
}
