/**
 * Browser-side image normalization before OCR upload:
 * decode (EXIF orientation applied), downscale to `maxSide`, re-encode as JPEG.
 * Keeps uploads small (Cloud Run 256Mi, 5 MB API cap) whatever the source.
 */

export const OCR_MAX_SIDE_PX = 2000;
export const OCR_JPEG_QUALITY = 0.85;
/** Raw input cap before decoding (cloud picks, huge camera files). */
export const OCR_MAX_INPUT_BYTES = 25 * 1024 * 1024;

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
 * Decode, downscale and re-encode an image as JPEG.
 * @throws ImageImportError on non-image, oversize or undecodable input (e.g. HEIC on Chrome desktop).
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
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImageImportError("IMAGE_DECODE_FAILED");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(decoded.source, 0, 0, width, height);
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", OCR_JPEG_QUALITY));
    if (!out) throw new ImageImportError("IMAGE_DECODE_FAILED");
    return out;
  } finally {
    decoded.release();
  }
}
