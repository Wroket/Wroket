"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import ImageSourceMenu from "@/components/ocr/ImageSourceMenu";
import ViewportOverlay, { sheetPanelClass } from "@/components/ui/ViewportOverlay";
import { useNarrowVisualViewport } from "@/hooks/useVisualViewportRect";
import { useLocale } from "@/lib/LocaleContext";
import { ApiClientError, formatUserFacingError } from "@/lib/apiErrors";
import { ocrNoteAttachment, ocrNoteImage, type OcrResult, type OcrSource } from "@/lib/api/notes";
import { CloudPickerError, type PickedImage } from "@/lib/cloudPickers/common";
import {
  isDropboxChooserConfigured,
  pickImageFromDropbox,
  preloadDropboxChooser,
} from "@/lib/cloudPickers/dropboxChooser";
import {
  isGoogleDrivePickerConfigured,
  pickImageFromGoogleDrive,
  preloadGoogleDrivePicker,
} from "@/lib/cloudPickers/googleDrivePicker";
import { ImageImportError, normalizeImageForOcr } from "@/lib/imageNormalize";

/** Languages offered as optional hints; any BCP-47 code works server-side. */
const LANGUAGE_HINTS = ["fr", "en", "es", "de", "it", "pt", "nl", "pl", "ru", "uk", "tr", "ar", "he", "hi", "zh", "ja", "ko"];

type Phase = "pick" | "loading" | "processing" | "preview";

interface PreparedImage {
  blob: Blob;
  source: OcrSource;
  name: string;
  previewUrl: string;
}

interface NoteOcrDialogProps {
  open: boolean;
  noteId: string;
  /** OCR an existing image attachment instead of importing a new image. */
  attachment?: { id: string; name: string } | null;
  /** Owner only: offer "attach the image to the note". */
  canAttach: boolean;
  remaining?: number;
  onClose: () => void;
  onInsert: (text: string) => void;
  onAttachImage?: (file: File) => Promise<void>;
}

/**
 * Photo → editable text preview. Sources: device file, camera, drag-and-drop,
 * paste, Google Drive, Dropbox, or an existing attachment. Nothing is saved
 * until the user clicks Insert (then the note's normal save applies).
 */
export default function NoteOcrDialog({
  open,
  noteId,
  attachment,
  canAttach,
  remaining,
  onClose,
  onInsert,
  onAttachImage,
}: NoteOcrDialogProps) {
  const { t, locale } = useLocale();
  const titleId = useId();
  const narrow = useNarrowVisualViewport(open);
  const [phase, setPhase] = useState<Phase>("pick");
  const [image, setImage] = useState<PreparedImage | null>(null);
  const [languageHint, setLanguageHint] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      return sessionStorage.getItem("wroket-ocr-lang") ?? "";
    } catch {
      return "";
    }
  });
  const [result, setResult] = useState<OcrResult | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attachImage, setAttachImage] = useState(false);
  const [externalPicker, setExternalPicker] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState(false);
  const runRef = useRef(0);

  const driveEnabled = useMemo(() => isGoogleDrivePickerConfigured(), []);
  const dropboxEnabled = useMemo(() => isDropboxChooserConfigured(), []);

  const languageName = useCallback(
    (code: string) => {
      try {
        return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code;
      } catch {
        return code;
      }
    },
    [locale],
  );

  const describeError = useCallback(
    (err: unknown): string => {
      if (err instanceof ImageImportError || err instanceof CloudPickerError) {
        return t(`notes.ocr.err.${err.code}`);
      }
      if (err instanceof ApiClientError && err.status === 404) return t("notes.ocr.err.noteNotFound");
      return formatUserFacingError(err, "errors.code.OCR_PROVIDER_ERROR", locale);
    },
    [t, locale],
  );

  const runOcr = useCallback(
    async (target: PreparedImage | null, hint: string) => {
      const run = ++runRef.current;
      setError(null);
      setPhase("processing");
      try {
        const res = attachment
          ? await ocrNoteAttachment(noteId, attachment.id, { languageHint: hint || undefined })
          : await ocrNoteImage(noteId, target!.blob, { languageHint: hint || undefined, source: target!.source });
        if (run !== runRef.current) return;
        setResult(res);
        setText(res.text);
        setPhase("preview");
      } catch (err) {
        if (run !== runRef.current) return;
        setError(describeError(err));
        setPhase(attachment || target ? "preview" : "pick");
      }
    },
    [attachment, noteId, describeError],
  );

  const acceptBlob = useCallback(
    async (blob: Blob, name: string, source: OcrSource) => {
      setError(null);
      setPhase("loading");
      try {
        const normalized = await normalizeImageForOcr(blob, name);
        const prepared: PreparedImage = {
          blob: normalized,
          source,
          name: name.replace(/\.[^.]+$/, "") || "photo",
          previewUrl: URL.createObjectURL(normalized),
        };
        setImage(prepared);
        await runOcr(prepared, languageHint);
      } catch (err) {
        setError(describeError(err));
        setPhase(image ? "preview" : "pick");
      }
    },
    [runOcr, languageHint, describeError, image],
  );

  const pickFromCloud = useCallback(
    async (provider: "gdrive" | "dropbox") => {
      setError(null);
      if (provider === "gdrive") setExternalPicker(true);
      try {
        const picked: PickedImage | null =
          provider === "gdrive" ? await pickImageFromGoogleDrive(locale) : await pickImageFromDropbox();
        setExternalPicker(false);
        if (picked) await acceptBlob(picked.blob, picked.name, provider);
      } catch (err) {
        setExternalPicker(false);
        setError(describeError(err));
      }
    },
    [acceptBlob, describeError, locale],
  );

  // Reset on open; attachment mode starts OCR right away.
  useEffect(() => {
    if (!open) return;
    runRef.current += 1;
    setResult(null);
    setText("");
    setError(null);
    setAttachImage(false);
    setCopied(false);
    setImage(null);
    if (attachment) {
      void runOcr(null, languageHint);
    } else {
      setPhase("pick");
      if (driveEnabled) preloadGoogleDrivePicker().catch(() => {});
      if (dropboxEnabled) preloadDropboxChooser().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, attachment?.id]);

  useEffect(() => () => {
    if (image) URL.revokeObjectURL(image.previewUrl);
  }, [image]);

  // Paste an image from the clipboard while the dialog is open.
  useEffect(() => {
    if (!open || attachment) return;
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (!file) return;
      e.preventDefault();
      void acceptBlob(file, file.name || "capture", "paste");
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [open, attachment, acceptBlob]);

  const busy = phase === "loading" || phase === "processing";

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (attachment || busy) return;
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/") || !f.type);
    if (file) void acceptBlob(file, file.name, "drop");
  };

  const handleClose = () => {
    runRef.current += 1;
    onClose();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const handleInsert = async () => {
    const value = text.trim();
    if (!value) return;
    onInsert(value);
    if (attachImage && image && onAttachImage) {
      await onAttachImage(new File([image.blob], `${image.name}.jpg`, { type: "image/jpeg" }));
    }
    handleClose();
  };

  const detected = result?.detectedLanguages?.[0]?.code;
  const showPicker = !attachment && (phase === "pick" || (phase === "loading" && !image));

  return (
    <ViewportOverlay
      open={open && !externalPicker}
      onClose={busy ? undefined : handleClose}
      zClassName="z-[110]"
      backdropClassName="absolute inset-0 bg-black/50"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onDragOver={(e) => {
          if (attachment) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={sheetPanelClass(
          narrow,
          `relative w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 border shadow-xl p-5 space-y-4 ${
            dragOver ? "border-emerald-500 ring-2 ring-emerald-400/50" : "border-zinc-200 dark:border-slate-700"
          }`,
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-base font-semibold text-zinc-900 dark:text-slate-100">
              {t("notes.ocr.title")}
            </h2>
            {attachment && (
              <p className="text-xs text-zinc-500 dark:text-slate-400 mt-0.5 truncate">
                {t("notes.ocr.fromAttachment")} {attachment.name}
              </p>
            )}
          </div>
          {typeof remaining === "number" && (
            <span className="text-[11px] text-zinc-400 dark:text-slate-500 shrink-0">
              {t("notes.ocr.remaining").replace("{n}", String(remaining))}
            </span>
          )}
        </div>

        <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-slate-300">
          <span className="shrink-0">{t("notes.ocr.language")}</span>
          <select
            value={languageHint}
            onChange={(e) => {
              const next = e.target.value;
              setLanguageHint(next);
              try {
                if (next) sessionStorage.setItem("wroket-ocr-lang", next);
                else sessionStorage.removeItem("wroket-ocr-lang");
              } catch {
                /* ignore */
              }
              // Re-run immediately when a result is already on screen (hint must apply now).
              if (phase === "preview" && (image || attachment)) {
                void runOcr(image, next);
              }
            }}
            disabled={busy}
            className="flex-1 rounded-md border border-zinc-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-xs"
          >
            <option value="">{t("notes.ocr.languageAuto")}</option>
            {LANGUAGE_HINTS.map((code) => (
              <option key={code} value={code}>
                {languageName(code)}
              </option>
            ))}
          </select>
        </label>

        {showPicker && (
          <div className="space-y-2">
            <ImageSourceMenu
              disabled={busy}
              driveEnabled={driveEnabled}
              dropboxEnabled={dropboxEnabled}
              onFile={(file, source) => void acceptBlob(file, file.name, source)}
              onPickDrive={() => void pickFromCloud("gdrive")}
              onPickDropbox={() => void pickFromCloud("dropbox")}
            />
            <div
              className={`rounded-lg border-2 border-dashed px-3 py-4 text-center text-xs ${
                dragOver
                  ? "border-emerald-500 text-emerald-700 dark:text-emerald-300"
                  : "border-zinc-200 dark:border-slate-700 text-zinc-500 dark:text-slate-400"
              }`}
            >
              {t("notes.ocr.dropHint")}
            </div>
            <p className="text-[11px] text-zinc-400 dark:text-slate-500">{t("notes.ocr.otherSourcesHint")}</p>
          </div>
        )}

        {busy && (
          <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-slate-300" role="status" aria-live="polite">
            <span className="w-4 h-4 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" aria-hidden />
            {phase === "loading" ? t("notes.ocr.loadingSource") : t("notes.ocr.processing")}
          </div>
        )}

        {error && (
          <p role="alert" className="text-xs text-red-600 dark:text-red-400 rounded-md border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 px-2 py-1.5">
            {error}
          </p>
        )}

        {phase === "preview" && (
          <div className="space-y-2">
            <div className="flex gap-3">
              {image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={image.previewUrl}
                  alt=""
                  className="w-16 h-16 object-cover rounded-md border border-zinc-200 dark:border-slate-700 shrink-0"
                />
              )}
              <div className="flex-1 min-w-0 text-xs text-zinc-500 dark:text-slate-400 space-y-1">
                {detected && (
                  <p>
                    {t("notes.ocr.detected")} <span className="font-medium text-zinc-700 dark:text-slate-200">{languageName(detected)}</span>
                  </p>
                )}
                {result?.code === "OCR_NO_TEXT" && <p className="text-amber-600 dark:text-amber-400">{t("notes.ocr.noText")}</p>}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void runOcr(image, languageHint)}
                    className="text-emerald-700 dark:text-emerald-400 hover:underline"
                  >
                    {t("notes.ocr.retry")}
                  </button>
                  {!attachment && (
                    <button
                      type="button"
                      onClick={() => {
                        setResult(null);
                        setText("");
                        setError(null);
                        setPhase("pick");
                      }}
                      className="text-zinc-600 dark:text-slate-300 hover:underline"
                    >
                      {t("notes.ocr.otherImage")}
                    </button>
                  )}
                </div>
              </div>
            </div>
            {result && (
              <label className="block">
                <span className="text-xs font-medium text-zinc-600 dark:text-slate-300">{t("notes.ocr.previewLabel")}</span>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  dir="auto"
                  rows={narrow ? 8 : 10}
                  className="mt-1 w-full rounded-md border border-zinc-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-2 text-sm text-zinc-800 dark:text-slate-100 font-mono leading-relaxed"
                />
              </label>
            )}
            {canAttach && image && onAttachImage && (
              <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-slate-300">
                <input type="checkbox" checked={attachImage} onChange={(e) => setAttachImage(e.target.checked)} />
                {t("notes.ocr.attachImage")}
              </label>
            )}
          </div>
        )}

        <p className="text-[11px] text-zinc-400 dark:text-slate-500">{t("notes.ocr.privacy")}</p>

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg px-3 py-2 text-sm text-zinc-600 dark:text-slate-300 hover:bg-zinc-100 dark:hover:bg-slate-800"
          >
            {t("notes.ocr.cancel")}
          </button>
          {phase === "preview" && result && (
            <>
              <button
                type="button"
                onClick={() => void handleCopy()}
                disabled={!text.trim()}
                className="rounded-lg border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-700 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                {copied ? t("notes.ocr.copied") : t("notes.ocr.copy")}
              </button>
              <button
                type="button"
                onClick={() => void handleInsert()}
                disabled={!text.trim()}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                {t("notes.ocr.insert")}
              </button>
            </>
          )}
        </div>
      </div>
    </ViewportOverlay>
  );
}
