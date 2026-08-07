"use client";

import { useEffect } from "react";

export interface UseModalCloseKeysOptions {
  /**
   * Also close on Enter when focus is on a field (inputs, etc.).
   * Skips textarea / contenteditable / buttons / menus.
   * @default true
   */
  enterCloses?: boolean;
}

/**
 * Escape always dismisses. Enter dismisses from plain fields so closing
 * works whether or not the user changed anything.
 */
export function useModalCloseKeys(
  active: boolean,
  onClose: () => void | Promise<void>,
  options?: UseModalCloseKeysOptions,
): void {
  const enterCloses = options?.enterCloses !== false;

  useEffect(() => {
    if (!active) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (e.defaultPrevented) return;
        e.preventDefault();
        void onClose();
        return;
      }

      if (!enterCloses || e.key !== "Enter" || e.isComposing) return;
      if (e.defaultPrevented) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (
        target.tagName === "TEXTAREA" ||
        target.isContentEditable ||
        target.closest('[contenteditable="true"]')
      ) {
        return;
      }

      if (
        target.tagName === "BUTTON" ||
        target.tagName === "A" ||
        target.tagName === "SELECT" ||
        target.tagName === "SUMMARY" ||
        target.getAttribute("role") === "button" ||
        target.getAttribute("role") === "menuitem" ||
        target.getAttribute("role") === "option" ||
        target.getAttribute("role") === "switch" ||
        target.closest('[role="menu"], [role="listbox"], [role="dialog"][data-confirm]')
      ) {
        return;
      }

      // Confirm / delete dialogs: never close on Enter from the panel itself
      if (target.getAttribute("role") === "dialog" || target.tabIndex === -1) {
        const dialog = target.closest('[role="dialog"]');
        if (dialog?.hasAttribute("data-confirm")) return;
      }

      e.preventDefault();
      void onClose();
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, onClose, enterCloses]);
}
