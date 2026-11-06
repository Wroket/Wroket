/**
 * Short reason from a failed Vertex response.
 * The prompt and the note text are never included.
 */
export async function vertexFailureReason(res: Response): Promise<string> {
  let detail = "";
  try {
    const raw = await res.text();
    const parsed = JSON.parse(raw) as { error?: { status?: string; message?: string } };
    const status = typeof parsed.error?.status === "string" ? parsed.error.status : "";
    const message = typeof parsed.error?.message === "string"
      ? parsed.error.message.replace(/\s+/g, " ").slice(0, 180)
      : "";
    detail = [status, message].filter(Boolean).join(": ");
  } catch {
    detail = "";
  }
  return detail ? `vertex HTTP ${res.status} ${detail}` : `vertex HTTP ${res.status}`;
}
