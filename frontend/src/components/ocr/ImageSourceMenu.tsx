"use client";

import { useRef, useState } from "react";

import { useLocale } from "@/lib/LocaleContext";
import type { OcrSource } from "@/lib/api/notes";

interface ImageSourceMenuProps {
  disabled?: boolean;
  driveEnabled: boolean;
  dropboxEnabled: boolean;
  onFile: (file: File, source: OcrSource) => void;
  onPickDrive: () => void;
  onPickDropbox: () => void;
}

const btnCls =
  "flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm font-medium text-zinc-700 dark:text-slate-200 hover:border-emerald-400 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors";

/**
 * Image source buttons for OCR: device file, camera (touch devices),
 * Google Drive and Dropbox (only when configured).
 */
export default function ImageSourceMenu({
  disabled,
  driveEnabled,
  dropboxEnabled,
  onFile,
  onPickDrive,
  onPickDropbox,
}: ImageSourceMenuProps) {
  const { t } = useLocale();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  // Rendered only client-side (inside an opened portal), so no hydration mismatch.
  const [touch] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true,
  );

  const handleChange = (source: OcrSource) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onFile(file, source);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <button type="button" className={btnCls} disabled={disabled} onClick={() => fileRef.current?.click()}>
        <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        {t("notes.ocr.sourceDevice")}
      </button>
      {touch && (
        <button type="button" className={btnCls} disabled={disabled} onClick={() => cameraRef.current?.click()}>
          <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
          </svg>
          {t("notes.ocr.sourceCamera")}
        </button>
      )}
      {driveEnabled && (
        <button type="button" className={btnCls} disabled={disabled} onClick={onPickDrive}>
          <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden>
            <path fill="#0F9D58" d="M7.7 3h8.6l5.2 9-4.3 7.5-5.2-9z" opacity=".85" />
            <path fill="#4285F4" d="M2.5 12 7.7 3l4.3 7.5L6.8 19.5z" opacity=".85" />
            <path fill="#F4B400" d="M6.8 19.5 12 10.5h9.5l-4.3 9z" opacity=".85" />
          </svg>
          {t("notes.ocr.sourceDrive")}
        </button>
      )}
      {dropboxEnabled && (
        <button type="button" className={btnCls} disabled={disabled} onClick={onPickDropbox}>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#0061FF" aria-hidden>
            <path d="M6 2 0 6l6 4 6-4zm12 0-6 4 6 4 6-4zM0 14l6 4 6-4-6-4zm18-4-6 4 6 4 6-4zM6 19.5l6 4 6-4-6-4z" />
          </svg>
          {t("notes.ocr.sourceDropbox")}
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={handleChange("device")} />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        onChange={handleChange("camera")}
      />
    </div>
  );
}
