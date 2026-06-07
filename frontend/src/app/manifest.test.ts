import { describe, expect, it } from "vitest";

import manifest from "./manifest";

describe("PWA manifest", () => {
  it("exposes installable standalone shell metadata", () => {
    const m = manifest();

    expect(m.name).toBe("Wroket");
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/dashboard");
    expect(m.scope).toBe("/");
    expect(m.icons?.length).toBeGreaterThanOrEqual(2);
    expect(m.icons?.some((icon) => icon.purpose === "maskable")).toBe(true);
    expect(m.shortcuts?.length).toBeGreaterThanOrEqual(2);
  });
});
