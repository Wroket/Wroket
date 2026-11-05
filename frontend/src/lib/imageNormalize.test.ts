import { describe, expect, it } from "vitest";

import {
  computeTargetSize,
  enhanceGrayscaleContrast,
  findWhiteboardCrop,
  longestRunAbove,
  looksLikeImage,
  luma,
  OCR_MAX_SIDE_PX,
  scaleCropRect,
} from "./imageNormalize";

/** Build an opaque RGBA buffer filled with a solid color. */
function solid(width: number, height: number, r: number, g: number, b: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = 255;
  }
  return data;
}

/**
 * Dark frame with a bright rectangle (simulated whiteboard) and a few dark ink pixels.
 */
function boardOnDarkBg(
  width: number,
  height: number,
  board: { x: number; y: number; w: number; h: number },
): Uint8ClampedArray {
  const data = solid(width, height, 30, 30, 30);
  for (let y = board.y; y < board.y + board.h; y++) {
    for (let x = board.x; x < board.x + board.w; x++) {
      const o = (y * width + x) * 4;
      data[o] = 240;
      data[o + 1] = 240;
      data[o + 2] = 235;
    }
  }
  // Simulated blue ink strokes inside the board.
  for (let x = board.x + 10; x < board.x + board.w - 10; x++) {
    const y = board.y + Math.floor(board.h / 3);
    const o = (y * width + x) * 4;
    data[o] = 20;
    data[o + 1] = 40;
    data[o + 2] = 160;
  }
  return data;
}

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

describe("longestRunAbove", () => {
  it("finds the longest contiguous run", () => {
    expect(longestRunAbove([0, 1, 1, 1, 0, 1, 1, 0], 1, 2)).toEqual([1, 4]);
  });

  it("bridges short gaps from ink strokes", () => {
    expect(longestRunAbove([1, 1, 0, 1, 1, 1], 1, 4, 1)).toEqual([0, 6]);
  });

  it("returns null when no run is long enough", () => {
    expect(longestRunAbove([1, 0, 1, 0, 1], 1, 2)).toBeNull();
  });
});

describe("findWhiteboardCrop", () => {
  it("crops to the bright board and ignores the dark background", () => {
    const board = { x: 40, y: 30, w: 120, h: 100 };
    const data = boardOnDarkBg(200, 180, board);
    const crop = findWhiteboardCrop(data, 200, 180);
    expect(crop).not.toBeNull();
    // Allow padding around the true board.
    expect(crop!.x).toBeLessThanOrEqual(board.x);
    expect(crop!.y).toBeLessThanOrEqual(board.y);
    expect(crop!.x + crop!.width).toBeGreaterThanOrEqual(board.x + board.w);
    expect(crop!.y + crop!.height).toBeGreaterThanOrEqual(board.y + board.h);
    expect(crop!.width * crop!.height).toBeLessThan(200 * 180 * 0.92);
  });

  it("returns null for a uniform bright page (already full-frame content)", () => {
    const data = solid(100, 100, 250, 250, 250);
    expect(findWhiteboardCrop(data, 100, 100)).toBeNull();
  });

  it("returns null for a uniform dark image", () => {
    const data = solid(100, 100, 20, 20, 20);
    expect(findWhiteboardCrop(data, 100, 100)).toBeNull();
  });
});

describe("scaleCropRect", () => {
  it("maps analysis coordinates back to full resolution", () => {
    expect(scaleCropRect({ x: 10, y: 20, width: 50, height: 40 }, 100, 100, 400, 400)).toEqual({
      x: 40,
      y: 80,
      width: 200,
      height: 160,
    });
  });
});

describe("enhanceGrayscaleContrast", () => {
  it("converts to grayscale and stretches a low-contrast board", () => {
    const data = solid(40, 40, 200, 200, 200);
    // ~3% dark ink-like pixels so they sit below the 1st percentile.
    for (let i = 0; i < 50; i++) {
      data[i * 4] = 80;
      data[i * 4 + 1] = 80;
      data[i * 4 + 2] = 80;
    }
    enhanceGrayscaleContrast(data, 40, 40);
    // Ink moves toward black, board toward white; output is grayscale.
    expect(data[0]).toBeLessThan(30);
    expect(data[200]).toBeGreaterThan(220);
    expect(data[200]).toBe(data[201]);
    expect(data[201]).toBe(data[202]);
  });

  it("handles flat images without crashing", () => {
    const data = solid(8, 8, 128, 128, 128);
    enhanceGrayscaleContrast(data, 8, 8);
    expect(luma(data[0], data[1], data[2])).toBeCloseTo(128, 0);
  });
});
