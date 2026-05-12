import { API_BASE_URL } from "./core";

export interface PostPricingContactBody {
  firstName: string;
  lastName: string;
  email: string;
  tier: string;
  locale: "fr" | "en";
  confirmResubmit?: boolean;
}

export type PostPricingContactResult =
  | { ok: true; ackSent: boolean }
  | { ok: false; status: number; message: string; code?: string };

export async function postPricingContact(body: PostPricingContactBody): Promise<PostPricingContactResult> {
  const res = await fetch(`${API_BASE_URL}/marketing/pricing-contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (res.ok) {
    const data = (await res.json()) as { ok?: boolean; ackSent?: boolean };
    return { ok: true, ackSent: !!data.ackSent };
  }

  let message = "Erreur";
  let code: string | undefined;
  try {
    const j = (await res.json()) as { message?: string; code?: string };
    if (typeof j.message === "string") message = j.message;
    if (typeof j.code === "string") code = j.code;
  } catch {
    /* ignore */
  }
  return { ok: false, status: res.status, message, code };
}
