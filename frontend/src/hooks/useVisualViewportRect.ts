"use client";

import { useLayoutEffect, useState, type CSSProperties } from "react";

export interface VisualViewportRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Box of what the user actually sees. On Android Chrome a wide document
 * inflates the layout viewport, so `fixed; inset: 0` and `window.innerWidth`
 * sit outside the screen. This tracks `visualViewport` instead.
 */
export function useVisualViewportRect(active: boolean): VisualViewportRect | null {
  const [rect, setRect] = useState<VisualViewportRect | null>(null);

  useLayoutEffect(() => {
    if (!active || typeof window === "undefined") return;
    const update = () => {
      const vv = window.visualViewport;
      if (!vv) {
        setRect({ top: 0, left: 0, width: window.innerWidth, height: window.innerHeight });
        return;
      }
      setRect({ top: vv.offsetTop, left: vv.offsetLeft, width: vv.width, height: vv.height });
    };
    update();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [active]);

  return active ? rect : null;
}

/** Tailwind `sm` breakpoint — use visual width, not the inflated layout viewport. */
export const NARROW_VISUAL_VIEWPORT_PX = 640;

/**
 * True when the *visible* area is under 640px.
 * Prefer this over Tailwind `sm:` when the layout viewport may be wider than the screen.
 */
export function useNarrowVisualViewport(active = true): boolean {
  const rect = useVisualViewportRect(active);
  if (!active) return false;
  if (!rect) {
    if (typeof window === "undefined") return false;
    return window.innerWidth < NARROW_VISUAL_VIEWPORT_PX;
  }
  return rect.width < NARROW_VISUAL_VIEWPORT_PX;
}

/** Overlay pinned to the visual viewport. Falls back to the layout viewport before the first measure. */
export function visualViewportOverlayStyle(rect: VisualViewportRect | null): CSSProperties {
  if (!rect) {
    return { position: "fixed", inset: 0 };
  }
  return {
    position: "fixed",
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

export interface ClampInVisualViewportOptions {
  width: number;
  height: number;
  /** Preferred top (layout coords). */
  preferredTop: number;
  /** Preferred left (layout coords). */
  preferredLeft: number;
  pad?: number;
}

/** Keep a fixed box inside the visual viewport (for portaled menus / popovers). */
export function clampInVisualViewport({
  width,
  height,
  preferredTop,
  preferredLeft,
  pad = 8,
}: ClampInVisualViewportOptions): { top: number; left: number; maxWidth: number } {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  const viewLeft = vv?.offsetLeft ?? 0;
  const viewTop = vv?.offsetTop ?? 0;
  const viewWidth = vv?.width ?? (typeof window !== "undefined" ? window.innerWidth : 390);
  const viewHeight = vv?.height ?? (typeof window !== "undefined" ? window.innerHeight : 844);
  const maxWidth = Math.max(160, viewWidth - pad * 2);
  const w = Math.min(width, maxWidth);
  const left = Math.max(viewLeft + pad, Math.min(preferredLeft, viewLeft + viewWidth - w - pad));
  const top = Math.max(viewTop + pad, Math.min(preferredTop, viewTop + viewHeight - height - pad));
  return { top, left, maxWidth };
}
