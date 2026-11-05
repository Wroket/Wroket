/**
 * Google Drive image picker (browser only).
 *
 * Google Identity Services token client (scope `drive.file`, non-sensitive: only
 * files the user picks) + Google Picker + `drive/v3/files/{id}?alt=media`.
 * The access token stays in module memory and is never sent to the Wroket API.
 */
import { OCR_MAX_INPUT_BYTES } from "@/lib/imageNormalize";

import {
  CloudPickerError,
  downloadPickedFile,
  loadScriptOnce,
  mimeFromName,
  PICKER_IMAGE_MIME_TYPES,
  type PickedImage,
} from "./common";

const GIS_SRC = "https://accounts.google.com/gsi/client";
const GAPI_SRC = "https://apis.google.com/js/api.js";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const TOKEN_MARGIN_MS = 60_000;

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

interface GoogleGlobal {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (resp: TokenResponse) => void;
        error_callback?: (err: { type?: string }) => void;
      }): { requestAccessToken(overrides?: { prompt?: string }): void };
    };
  };
  picker: {
    DocsView: new (viewId?: string) => {
      setMimeTypes(types: string): unknown;
      setIncludeFolders(v: boolean): unknown;
      setSelectFolderEnabled(v: boolean): unknown;
    };
    PickerBuilder: new () => PickerBuilder;
    ViewId: { DOCS_IMAGES: string };
    Action: { PICKED: string; CANCEL: string };
    Feature: { NAV_HIDDEN: string };
  };
}

interface PickerBuilder {
  addView(view: unknown): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(id: string): PickerBuilder;
  setLocale(locale: string): PickerBuilder;
  setCallback(cb: (data: PickerResponse) => void): PickerBuilder;
  build(): { setVisible(v: boolean): void };
}

interface PickerResponse {
  action: string;
  docs?: Array<{ id: string; name?: string; mimeType?: string; sizeBytes?: number | string }>;
}

declare global {
  interface Window {
    google?: GoogleGlobal;
    gapi?: { load(name: string, cb: { callback: () => void; onerror: () => void }): void };
  }
}

function clientId(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ?? "";
}

function apiKey(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY?.trim() ?? "";
}

/** Cloud project number, i.e. the numeric prefix of the OAuth client id (`123-abc.apps…`). */
export function projectNumberFromClientId(id: string): string {
  const match = /^(\d+)-/.exec(id.trim());
  return match ? match[1] : "";
}

/** True when both the OAuth client id and the Picker API key are configured. */
export function isGoogleDrivePickerConfigured(): boolean {
  return !!clientId() && !!apiKey() && !!projectNumberFromClientId(clientId());
}

let token: { value: string; expiresAt: number } | null = null;
let ready: Promise<void> | null = null;

/** Load GIS + gapi Picker ahead of the click, so popups stay inside the user gesture. */
export function preloadGoogleDrivePicker(): Promise<void> {
  if (!isGoogleDrivePickerConfigured()) return Promise.reject(new CloudPickerError("PICKER_NOT_CONFIGURED"));
  if (!ready) {
    ready = Promise.all([loadScriptOnce(GIS_SRC), loadScriptOnce(GAPI_SRC)])
      .then(
        () =>
          new Promise<void>((resolve, reject) => {
            if (!window.gapi) return reject(new CloudPickerError("PICKER_LOAD_FAILED"));
            window.gapi.load("picker", {
              callback: () => resolve(),
              onerror: () => reject(new CloudPickerError("PICKER_LOAD_FAILED")),
            });
          }),
      )
      .catch((err) => {
        ready = null;
        throw err;
      });
  }
  return ready;
}

function requestToken(): Promise<string | null> {
  if (token && token.expiresAt - TOKEN_MARGIN_MS > Date.now()) return Promise.resolve(token.value);
  return new Promise((resolve, reject) => {
    const google = window.google;
    if (!google?.accounts?.oauth2) return reject(new CloudPickerError("PICKER_LOAD_FAILED"));
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId(),
      scope: DRIVE_SCOPE,
      callback: (resp) => {
        if (!resp.access_token) {
          resolve(null);
          return;
        }
        token = { value: resp.access_token, expiresAt: Date.now() + (resp.expires_in ?? 3600) * 1000 };
        resolve(resp.access_token);
      },
      error_callback: () => resolve(null),
    });
    client.requestAccessToken({ prompt: "" });
  });
}

function showPicker(accessToken: string, locale: string): Promise<PickerResponse["docs"] | null> {
  return new Promise((resolve) => {
    const google = window.google!;
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS_IMAGES);
    view.setMimeTypes(PICKER_IMAGE_MIME_TYPES.join(","));
    view.setIncludeFolders(true);
    view.setSelectFolderEnabled(false);
    const picker = new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey())
      .setAppId(projectNumberFromClientId(clientId()))
      .setLocale(locale)
      .setCallback((data) => {
        if (data.action === google.picker.Action.PICKED) resolve(data.docs ?? null);
        else if (data.action === google.picker.Action.CANCEL) resolve(null);
      })
      .build();
    picker.setVisible(true);
  });
}

/**
 * Let the user pick one image in Google Drive and download it.
 * Resolves to `null` when the user cancels (consent or picker).
 * @throws CloudPickerError
 */
export async function pickImageFromGoogleDrive(locale: string): Promise<PickedImage | null> {
  await preloadGoogleDrivePicker();
  const accessToken = await requestToken();
  if (!accessToken) return null;
  const docs = await showPicker(accessToken, locale);
  const doc = docs?.[0];
  if (!doc) return null;

  const size = Number(doc.sizeBytes ?? 0);
  if (size > OCR_MAX_INPUT_BYTES) throw new CloudPickerError("PICKER_DOWNLOAD_FAILED", "too large");

  const blob = await downloadPickedFile(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(doc.id)}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    OCR_MAX_INPUT_BYTES,
  );
  const name = doc.name ?? "drive-image";
  const type = blob.type || doc.mimeType || mimeFromName(name);
  return { blob: type && type !== blob.type ? new Blob([blob], { type }) : blob, name };
}
