"use client";

import { useEffect, useRef } from "react";
import { useLocale } from "@/lib/LocaleContext";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  /** Optional third action (e.g. alternate sync mode). Rendered between cancel and confirm. */
  secondaryLabel?: string;
  onSecondary?: () => void;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "info";
  onConfirm: () => void;
  onCancel: () => void;
}

const VARIANT_BUTTON: Record<string, string> = {
  danger: "bg-red-600 hover:bg-red-700 focus:ring-red-500",
  warning: "bg-amber-600 hover:bg-amber-700 focus:ring-amber-500",
  info: "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500",
};

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  secondaryLabel,
  onSecondary,
  cancelLabel,
  variant = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useLocale();
  const resolvedConfirmLabel = confirmLabel ?? t("confirm");
  const resolvedCancelLabel = cancelLabel ?? t("cancel");
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelBtnRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      if (e.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="relative bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
      >
        <h2
          id="confirm-dialog-title"
          className="text-lg font-semibold text-zinc-900 dark:text-slate-100"
        >
          {title}
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-slate-400">{message}</p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-md border border-zinc-300 dark:border-slate-600
              text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-700 transition-colors"
          >
            {resolvedCancelLabel}
          </button>
          {secondaryLabel && onSecondary ? (
            <button
              type="button"
              onClick={onSecondary}
              className="px-4 py-2 text-sm rounded-md border border-amber-500/80 dark:border-amber-600
                text-amber-900 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors"
            >
              {secondaryLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-sm rounded-md text-white transition-colors
              focus:outline-none focus:ring-2 focus:ring-offset-2 ${VARIANT_BUTTON[variant]}`}
          >
            {resolvedConfirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
