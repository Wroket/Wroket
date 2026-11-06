import { describe, expect, it } from "vitest";
import { vertexFailureReason } from "./vertexHttp";

describe("vertexFailureReason", () => {
  it("keeps the Google status and message", async () => {
    const res = new Response(
      JSON.stringify({ error: { status: "PERMISSION_DENIED", message: "Permission denied on the model" } }),
      { status: 403 },
    );
    expect(await vertexFailureReason(res)).toBe(
      "vertex HTTP 403 PERMISSION_DENIED: Permission denied on the model",
    );
  });

  it("falls back to the status when the body is not JSON", async () => {
    const res = new Response("nope", { status: 502 });
    expect(await vertexFailureReason(res)).toBe("vertex HTTP 502");
  });
});
