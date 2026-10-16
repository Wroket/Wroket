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
