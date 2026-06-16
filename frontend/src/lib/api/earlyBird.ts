import { API_BASE_URL, apiFetchDefaults } from "./core";

export interface PostEarlyBirdEnrollBody {
  locale: "fr" | "en";
}

export type PostEarlyBirdEnrollResult =
  | { ok: true; earlyBird: boolean; alreadyEnrolled: boolean; ackSent: boolean }
  | { ok: false; status: number; message: string };

export async function postEarlyBirdEnroll(body: PostEarlyBirdEnrollBody): Promise<PostEarlyBirdEnrollResult> {
  const res = await fetch(`${API_BASE_URL}/early-bird/enroll`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...apiFetchDefaults,
  });

  if (res.ok) {
    const data = (await res.json()) as {
      ok?: boolean;
      earlyBird?: boolean;
      alreadyEnrolled?: boolean;
      ackSent?: boolean;
    };
    return {
      ok: true,
      earlyBird: !!data.earlyBird,
      alreadyEnrolled: !!data.alreadyEnrolled,
      ackSent: !!data.ackSent,
    };
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
