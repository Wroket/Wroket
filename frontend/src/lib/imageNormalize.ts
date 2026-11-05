/**
 * Browser-side image normalization before OCR upload:
 * decode (EXIF orientation), downscale, auto-crop bright regions (whiteboard),
 * grayscale + contrast stretch, re-encode as JPEG.
 */

export const OCR_MAX_SIDE_PX = 2000;
export const OCR_JPEG_QUALITY = 0.9;
/** Raw input cap before decoding (cloud picks, huge camera files). */
export const OCR_MAX_INPUT_BYTES = 25 * 1024 * 1024;
/** Analysis is done on a downscaled copy for speed. */
const ANALYSIS_MAX_SIDE = 480;
/** Keep full frame if the crop does not remove enough background. */
const MIN_CROP_AREA_RATIO = 0.12;
const MAX_CROP_AREA_RATIO = 0.92;
const CROP_PADDING_RATIO = 0.03;

/** Client-side failure with a machine-readable code mapped to i18n. */
export class ImageImportError extends Error {
  constructor(
    public readonly code: "IMAGE_DECODE_FAILED" | "IMAGE_TOO_LARGE" | "IMAGE_NOT_AN_IMAGE",
    message = code,
  ) {
    super(message);
    this.name = "ImageImportError";
  }
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Target dimensions preserving aspect ratio, never upscaling. */
export function computeTargetSize(
  width: number,
  height: number,
  maxSide: number = OCR_MAX_SIDE_PX,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width: Math.round(width), height: Math.round(height) };
  const ratio = maxSide / longest;
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|heic|heif|bmp|tiff?)$/i;

/** True when the blob looks like an image (MIME, or extension when MIME is empty). */
export function looksLikeImage(type: string, name?: string): boolean {
  if (type) return type.startsWith("image/");
  return !!name && IMAGE_EXT_RE.test(name);
}

/** Rec. 601 luma in 0..255. */
export function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Longest run where `scores[i] >= threshold`, allowing short gaps (handwritten
 * ink lines that darken a whole row/column of a whiteboard).
 * Returns `[start, endExclusive]` or `null` if none is long enough.
 */
export function longestRunAbove(
  scores: ArrayLike<number>,
  threshold: number,
  minLength: number,
  maxGap: number = 0,
): [number, number] | null {
  let bestStart = -1;
  let bestEnd = -1;
  let runStart = -1;
  let gap = 0;

  const closeRun = (endExclusive: number) => {
    if (runStart < 0) return;
    if (endExclusive - runStart > bestEnd - bestStart) {
      bestStart = runStart;
      bestEnd = endExclusive;
    }
    runStart = -1;
    gap = 0;
  };

  for (let i = 0; i < scores.length; i++) {
    if (scores[i] >= threshold) {
      if (runStart < 0) runStart = i;
      gap = 0;
    } else if (runStart >= 0) {
      gap += 1;
      if (gap > maxGap) closeRun(i - gap + 1);
    }
  }
  if (runStart >= 0) closeRun(scores.length);

  if (bestStart < 0 || bestEnd - bestStart < minLength) return null;
  return [bestStart, bestEnd];
}

/**
 * Detect a bright rectangular region (whiteboard / paper on a darker background).
 * Uses row/column projections of the 75th-percentile luma so dark ink still counts as “on board”.
 * Returns `null` when no confident crop is found (caller should keep the full frame).
 */
export function findWhiteboardCrop(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): CropRect | null {
  if (width < 8 || height < 8 || rgba.length < width * height * 4) return null;

  // Fraction of "surface" pixels (bright enough to be board/paper, not ink/background).
  const SURFACE = 170;
  const rowScore = new Float64Array(height);
  for (let y = 0; y < height; y++) {
    let bright = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (luma(rgba[i], rgba[i + 1], rgba[i + 2]) >= SURFACE) bright += 1;
    }
    rowScore[y] = bright / width;
  }

  // A board row usually has ≥25% bright surface even with handwriting.
  const rowThreshold = 0.25;
  const rowGap = Math.max(3, Math.floor(height * 0.04));
  const rowRun = longestRunAbove(rowScore, rowThreshold, Math.max(8, Math.floor(height * 0.12)), rowGap);
  if (!rowRun) return null;
  const [y0, y1] = rowRun;

  const colScore = new Float64Array(width);
  const rowsInBand = Math.max(1, y1 - y0);
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (luma(rgba[i], rgba[i + 1], rgba[i + 2]) >= SURFACE) colScore[x] += 1;
    }
  }
  for (let x = 0; x < width; x++) colScore[x] /= rowsInBand;

  const colThreshold = 0.25;
  const colGap = Math.max(3, Math.floor(width * 0.04));
  const colRun = longestRunAbove(colScore, colThreshold, Math.max(8, Math.floor(width * 0.12)), colGap);
  if (!colRun) return null;
  const [x0, x1] = colRun;

  const padX = Math.max(2, Math.round(width * CROP_PADDING_RATIO));
  const padY = Math.max(2, Math.round(height * CROP_PADDING_RATIO));
  const left = Math.max(0, x0 - padX);
  const top = Math.max(0, y0 - padY);
  const right = Math.min(width, x1 + padX);
  const bottom = Math.min(height, y1 + padY);
  const cropW = right - left;
  const cropH = bottom - top;
  const areaRatio = (cropW * cropH) / (width * height);
  if (areaRatio < MIN_CROP_AREA_RATIO || areaRatio > MAX_CROP_AREA_RATIO) return null;
  if (cropW < 16 || cropH < 16) return null;

  return { x: left, y: top, width: cropW, height: cropH };
}

/**
 * Scale a crop found on an analysis-sized image back to the full-resolution canvas.
 */
export function scaleCropRect(crop: CropRect, fromW: number, fromH: number, toW: number, toH: number): CropRect {
  const sx = toW / fromW;
  const sy = toH / fromH;
  const x = Math.max(0, Math.floor(crop.x * sx));
  const y = Math.max(0, Math.floor(crop.y * sy));
  const right = Math.min(toW, Math.ceil((crop.x + crop.width) * sx));
  const bottom = Math.min(toH, Math.ceil((crop.y + crop.height) * sy));
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

/**
 * In-place grayscale + percentile contrast stretch (p1→0, p99→255).
 * Improves handwritten ink on whiteboards without destroying faint strokes.
 */
export function enhanceGrayscaleContrast(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): void {
  const n = width * height;
  if (n === 0 || rgba.length < n * 4) return;

  const hist = new Uint32Array(256);
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const y = Math.round(luma(rgba[i], rgba[i + 1], rgba[i + 2]));
    hist[Math.max(0, Math.min(255, y))] += 1;
  }

  // Tight percentiles: keep faint ink while lifting a dull whiteboard.
  const lowTarget = Math.max(1, Math.floor(n * 0.01));
  const highTarget = Math.max(lowTarget + 1, Math.floor(n * 0.99));
  let low = 0;
  let high = 255;
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += hist[v];
    if (seen >= lowTarget) {
      low = v;
      break;
    }
  }
  seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += hist[v];
    if (seen >= highTarget) {
      high = v;
      break;
    }
  }
  if (high <= low + 8) {
    // Flat image — still convert to grayscale without stretch.
    for (let p = 0; p < n; p++) {
      const i = p * 4;
      const y = Math.round(luma(rgba[i], rgba[i + 1], rgba[i + 2]));
      rgba[i] = y;
      rgba[i + 1] = y;
      rgba[i + 2] = y;
    }
    return;
  }

  const span = high - low;
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const y = luma(rgba[i], rgba[i + 1], rgba[i + 2]);
    const stretched = Math.max(0, Math.min(255, Math.round(((y - low) * 255) / span)));
    rgba[i] = stretched;
    rgba[i + 1] = stretched;
    rgba[i + 2] = stretched;
  }
}

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function decode(blob: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close() };
    } catch {
      // fall through to <img> decoding (Safari HEIC, older engines)
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    throw new ImageImportError("IMAGE_DECODE_FAILED");
  }
}

/**
 * Decode, downscale, auto-crop a bright board/paper region when confident,
 * enhance contrast, and re-encode as JPEG.
 * @throws ImageImportError on non-image, oversize or undecodable input.
 */
export async function normalizeImageForOcr(blob: Blob, name?: string): Promise<Blob> {
  if (!looksLikeImage(blob.type, name)) throw new ImageImportError("IMAGE_NOT_AN_IMAGE");
  if (blob.size > OCR_MAX_INPUT_BYTES) throw new ImageImportError("IMAGE_TOO_LARGE");

  const decoded = await decode(blob);
  try {
    const { width, height } = computeTargetSize(decoded.width, decoded.height);
    if (!width || !height) throw new ImageImportError("IMAGE_DECODE_FAILED");

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new ImageImportError("IMAGE_DECODE_FAILED");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(decoded.source, 0, 0, width, height);

    // Analysis on a smaller canvas for crop detection.
    const analysis = computeTargetSize(width, height, ANALYSIS_MAX_SIDE);
    const aCanvas = document.createElement("canvas");
    aCanvas.width = analysis.width;
    aCanvas.height = analysis.height;
    const aCtx = aCanvas.getContext("2d", { willReadFrequently: true });
    if (!aCtx) throw new ImageImportError("IMAGE_DECODE_FAILED");
    aCtx.drawImage(canvas, 0, 0, analysis.width, analysis.height);
    const analysisData = aCtx.getImageData(0, 0, analysis.width, analysis.height);
    const cropSmall = findWhiteboardCrop(analysisData.data, analysis.width, analysis.height);

    let work = canvas;
    let w = width;
    let h = height;
    if (cropSmall) {
      const crop = scaleCropRect(cropSmall, analysis.width, analysis.height, width, height);
      const cropped = document.createElement("canvas");
      cropped.width = crop.width;
      cropped.height = crop.height;
      const cCtx = cropped.getContext("2d", { willReadFrequently: true });
      if (!cCtx) throw new ImageImportError("IMAGE_DECODE_FAILED");
      cCtx.drawImage(canvas, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
      work = cropped;
      w = crop.width;
      h = crop.height;
    }

    const outCtx = work.getContext("2d", { willReadFrequently: true });
    if (!outCtx) throw new ImageImportError("IMAGE_DECODE_FAILED");
    const pixels = outCtx.getImageData(0, 0, w, h);
    enhanceGrayscaleContrast(pixels.data, w, h);
    outCtx.putImageData(pixels, 0, 0);

    const out = await new Promise<Blob | null>((resolve) => work.toBlob(resolve, "image/jpeg", OCR_JPEG_QUALITY));
    if (!out) throw new ImageImportError("IMAGE_DECODE_FAILED");
    return out;
  } finally {
    decoded.release();
  }
}
