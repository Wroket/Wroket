"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { useModalCloseKeys } from "@/lib/useModalCloseKeys";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Max width class, default max-w-lg */
  size?: "sm" | "md" | "lg" | "xl";
  footer?: ReactNode;
  /** Accessible label id */
  titleId?: string;
}

const SIZE_CLS = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
} as const;

/**
 * Accessible modal primitive for UI V2 surfaces.
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
  footer,
  titleId = "ui-modal-title",
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useModalCloseKeys(open, onClose);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>("input,textarea,button")?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
    >
      <button
        type="button"
        className="absolute inset-0 bg-zinc-900/40 dark:bg-black/60 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={`relative w-full ${SIZE_CLS[size]} bg-white dark:bg-slate-900 rounded-sm border border-zinc-200 dark:border-slate-700 shadow-lg ui-v2-fade max-h-[90vh] flex flex-col`}
      >
        {title && (
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-zinc-100 dark:border-slate-800 shrink-0">
            <h2 id={titleId} className="text-base font-semibold text-zinc-900 dark:text-slate-100">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-slate-200 hover:bg-zinc-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Close"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0">{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-zinc-100 dark:border-slate-800 flex items-center justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
