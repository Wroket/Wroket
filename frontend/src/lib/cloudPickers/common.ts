/**
 * Shared helpers for cloud file pickers (Google Drive, Dropbox).
 * Pickers only run in the browser; tokens never leave memory nor reach the Wroket API.
 */

export type CloudPickerErrorCode = "PICKER_NOT_CONFIGURED" | "PICKER_LOAD_FAILED" | "PICKER_DOWNLOAD_FAILED";

export class CloudPickerError extends Error {
  constructor(public readonly code: CloudPickerErrorCode, message: string = code) {
    super(message);
    this.name = "CloudPickerError";
  }
}

/** Image picked from a cloud provider, downloaded as a Blob. */
export interface PickedImage {
  blob: Blob;
  name: string;
}

export const PICKER_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif"] as const;
export const PICKER_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
] as const;

const scriptLoads = new Map<string, Promise<void>>();

/**
 * Inject a third-party script once; resolves when loaded.
 * @throws CloudPickerError `PICKER_LOAD_FAILED`
 */
export function loadScriptOnce(src: string, attrs: Record<string, string> = {}): Promise<void> {
  const existing = scriptLoads.get(src);
  if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    el.onload = () => resolve();
    el.onerror = () => {
      scriptLoads.delete(src);
      el.remove();
      reject(new CloudPickerError("PICKER_LOAD_FAILED"));
    };
    document.head.appendChild(el);
  });
  scriptLoads.set(src, promise);
  return promise;
}

/**
 * Fetch a picked file as a Blob, with a size cap.
 * @throws CloudPickerError `PICKER_DOWNLOAD_FAILED`
 */
export async function downloadPickedFile(url: string, init: RequestInit, maxBytes: number): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, credentials: "omit" });
  } catch {
    throw new CloudPickerError("PICKER_DOWNLOAD_FAILED");
  }
  if (!res.ok) throw new CloudPickerError("PICKER_DOWNLOAD_FAILED", `HTTP ${res.status}`);
  const blob = await res.blob();
  if (blob.size > maxBytes) throw new CloudPickerError("PICKER_DOWNLOAD_FAILED", "too large");
  return blob;
}

/** Infer a MIME type from a file name when the provider gives none. */
export function mimeFromName(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    heic: "image/heic",
    heif: "image/heif",
  };
  return map[ext] ?? "";
}
