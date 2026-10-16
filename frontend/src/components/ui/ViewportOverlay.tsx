"use client";

import { createPortal } from "react-dom";
import type { CSSProperties, ReactNode } from "react";

import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import {
  useNarrowVisualViewport,
  useVisualViewportRect,
  visualViewportOverlayStyle,
} from "@/hooks/useVisualViewportRect";

interface ViewportOverlayProps {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  /** Backdrop click closes when onClose is set. Default true. */
  closeOnBackdrop?: boolean;
  /** z-index class, default z-[9998] */
  zClassName?: string;
  /** Extra classes on the flex frame. */
  className?: string;
  role?: "presentation" | "dialog";
  "aria-modal"?: boolean | "true" | "false";
  "aria-labelledby"?: string;
  /** When false, skip body scroll lock (nested overlays). Default true. */
  lockScroll?: boolean;
  /** Override backdrop class. */
  backdropClassName?: string;
}

/**
 * Full-screen overlay pinned to the *visual* viewport.
 * Narrow (&lt;640px visible): bottom sheet. Wide: centered dialog frame.
 * Use instead of `fixed inset-0` so Android layout-viewport inflation cannot push panels off-screen.
 */
export default function ViewportOverlay({
  open,
  onClose,
  children,
  closeOnBackdrop = true,
  zClassName = "z-[9998]",
  className = "",
  role = "presentation",
  "aria-modal": ariaModal,
  "aria-labelledby": ariaLabelledby,
  lockScroll = true,
  backdropClassName = "absolute inset-0 bg-black/40 backdrop-blur-sm",
}: ViewportOverlayProps) {
  useBodyScrollLock(lockScroll && open);
  const viewport = useVisualViewportRect(open);
  const narrow = useNarrowVisualViewport(open);

  if (!open || typeof document === "undefined") return null;

  const frameClass = narrow
    ? `flex items-end justify-center p-0 ${zClassName} ${className}`
    : `flex items-center justify-center p-4 ${zClassName} ${className}`;

  const style: CSSProperties = visualViewportOverlayStyle(viewport);

  return createPortal(
    <div
      className={frameClass}
      style={style}
      role={role}
      aria-modal={ariaModal}
      aria-labelledby={ariaLabelledby}
    >
      <div
        className={backdropClassName}
        aria-hidden
        onClick={() => {
          if (closeOnBackdrop && onClose) onClose();
        }}
      />
      {children}
    </div>,
    document.body,
  );
}

/**
 * Merge desktop panel classes with narrow bottom-sheet constraints.
 * Pass `narrow` from {@link useNarrowVisualViewport}.
 */
export function sheetPanelClass(narrow: boolean, wideClass: string, narrowExtra = ""): string {
  if (!narrow) return wideClass;
  const base =
    "w-full max-w-none mx-0 rounded-b-none max-h-[85dvh] overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))]";
  // Prefer top rounding for sheets
  const rounded = wideClass.includes("rounded-sm")
    ? "rounded-t-sm"
    : wideClass.includes("rounded-2xl")
      ? "rounded-t-2xl"
      : wideClass.includes("rounded-xl")
        ? "rounded-t-xl"
        : "rounded-t-lg";
  return `${wideClass} ${base} ${rounded} ${narrowExtra}`.replace(/\s+/g, " ").trim();
}
