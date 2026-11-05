import { describe, expect, it } from "vitest";

import { computeTargetSize, looksLikeImage, OCR_MAX_SIDE_PX } from "./imageNormalize";

describe("computeTargetSize", () => {
  it("keeps small images untouched", () => {
    expect(computeTargetSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("downscales landscape images to the max side", () => {
    expect(computeTargetSize(4000, 3000)).toEqual({ width: OCR_MAX_SIDE_PX, height: 1500 });
  });

  it("downscales portrait images to the max side", () => {
    expect(computeTargetSize(3024, 4032)).toEqual({ width: 1500, height: OCR_MAX_SIDE_PX });
  });

  it("handles degenerate sizes", () => {
    expect(computeTargetSize(0, 100)).toEqual({ width: 0, height: 0 });
    expect(computeTargetSize(10000, 1, 2000)).toEqual({ width: 2000, height: 1 });
  });
});

describe("looksLikeImage", () => {
  it("trusts the MIME type when present", () => {
    expect(looksLikeImage("image/heic")).toBe(true);
    expect(looksLikeImage("application/pdf", "photo.jpg")).toBe(false);
  });

  it("falls back to the extension when the MIME type is empty", () => {
    expect(looksLikeImage("", "IMG_0001.HEIC")).toBe(true);
    expect(looksLikeImage("", "notes.txt")).toBe(false);
    expect(looksLikeImage("")).toBe(false);
  });
});
