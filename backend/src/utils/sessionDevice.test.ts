import { describe, expect, it } from "vitest";

import { deviceLabelFromUserAgent } from "./sessionDevice";

describe("deviceLabelFromUserAgent", () => {
  it("parses Chrome on Windows", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    expect(deviceLabelFromUserAgent(ua)).toBe("Chrome · Windows");
  });

  it("parses Safari on iPhone", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    expect(deviceLabelFromUserAgent(ua)).toBe("Safari · iPhone");
  });

  it("returns fallback for empty UA", () => {
    expect(deviceLabelFromUserAgent(undefined)).toBe("Appareil inconnu");
  });
});
