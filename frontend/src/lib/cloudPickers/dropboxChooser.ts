/**
 * Dropbox image picker via the official Chooser (browser only, no OAuth).
 * `linkType: "direct"` returns a short-lived direct link fetched as a Blob.
 */
import { OCR_MAX_INPUT_BYTES } from "@/lib/imageNormalize";

import {
  CloudPickerError,
  downloadPickedFile,
  loadScriptOnce,
  mimeFromName,
  PICKER_IMAGE_EXTENSIONS,
  type PickedImage,
} from "./common";

const DROPINS_SRC = "https://www.dropbox.com/static/api/2/dropins.js";

interface DropboxFile {
  name: string;
  link: string;
  bytes: number;
}

interface DropboxGlobal {
  isBrowserSupported(): boolean;
  choose(options: {
    success: (files: DropboxFile[]) => void;
    cancel?: () => void;
    linkType: "direct" | "preview";
    multiselect: boolean;
    extensions?: string[];
    sizeLimit?: number;
  }): void;
}

declare global {
  interface Window {
    Dropbox?: DropboxGlobal;
  }
}

function appKey(): string {
  return process.env.NEXT_PUBLIC_DROPBOX_APP_KEY?.trim() ?? "";
}

/** True when a Dropbox app key is configured. */
export function isDropboxChooserConfigured(): boolean {
  return !!appKey();
}

/** Load `dropins.js` ahead of the click so the Chooser popup stays inside the user gesture. */
export function preloadDropboxChooser(): Promise<void> {
  if (!isDropboxChooserConfigured()) return Promise.reject(new CloudPickerError("PICKER_NOT_CONFIGURED"));
  return loadScriptOnce(DROPINS_SRC, { id: "dropboxjs", "data-app-key": appKey() });
}

/**
 * Let the user pick one image in Dropbox and download it.
 * Resolves to `null` on cancel.
 * @throws CloudPickerError
 */
export async function pickImageFromDropbox(): Promise<PickedImage | null> {
  await preloadDropboxChooser();
  const dropbox = window.Dropbox;
  if (!dropbox || !dropbox.isBrowserSupported()) throw new CloudPickerError("PICKER_LOAD_FAILED");

  const file = await new Promise<DropboxFile | null>((resolve) => {
    dropbox.choose({
      success: (files) => resolve(files[0] ?? null),
      cancel: () => resolve(null),
      linkType: "direct",
      multiselect: false,
      extensions: [...PICKER_IMAGE_EXTENSIONS],
      sizeLimit: OCR_MAX_INPUT_BYTES,
    });
  });
  if (!file) return null;

  const blob = await downloadPickedFile(file.link, {}, OCR_MAX_INPUT_BYTES);
  const type = blob.type && blob.type !== "application/octet-stream" ? blob.type : mimeFromName(file.name);
  return { blob: type && type !== blob.type ? new Blob([blob], { type }) : blob, name: file.name };
}
