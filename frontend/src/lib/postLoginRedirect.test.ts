import { describe, expect, it } from "vitest";

import { getPostLoginRedirect, safePostLoginRedirect } from "./postLoginRedirect";

describe("postLoginRedirect", () => {
  it("returns dashboard when redirect is missing", () => {
    expect(getPostLoginRedirect("")).toBe("/dashboard");
  });

  it("preserves task deep link from login query", () => {
    expect(getPostLoginRedirect("?redirect=%2Ftodos%3Ftask%3Dabc")).toBe("/todos?task=abc");
  });

  it("rejects external URLs", () => {
    expect(safePostLoginRedirect("https://evil.com")).toBe("/dashboard");
    expect(safePostLoginRedirect("//evil.com/path")).toBe("/dashboard");
  });
});
