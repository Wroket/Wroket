import { API_BASE_URL, apiFetchDefaults } from "./core";

export interface PostFeedbackBody {
  message: string;
  locale: "fr" | "en";
}

export type PostFeedbackResult =
  | { ok: true; ackSent: boolean }
  | { ok: false; status: number; message: string };

export async function postFeedback(body: PostFeedbackBody): Promise<PostFeedbackResult> {
  const res = await fetch(`${API_BASE_URL}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...apiFetchDefaults,
  });

  if (res.ok) {
    const data = (await res.json()) as { ok?: boolean; ackSent?: boolean };
    return { ok: true, ackSent: !!data.ackSent };
  }

  let message = "Erreur";
  try {
    const j = (await res.json()) as { message?: string };
    if (typeof j.message === "string") message = j.message;
  } catch {
    /* ignore */
  }
  return { ok: false, status: res.status, message };
}
