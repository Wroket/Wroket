"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";

export interface MenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
}

interface MenuProps {
  items: MenuItem[];
  /** Trigger button content (defaults to ⋯) */
  trigger?: ReactNode;
  triggerProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  /** Preferred horizontal anchor relative to the trigger. */
  align?: "left" | "right";
  label: string;
  /** Extra classes on the root wrapper (e.g. `w-full` for table badges). */
  className?: string;
}

/**
 * Dropdown / context menu for V2 task row actions.
 * Portaled to body so table `overflow-x-auto` does not clip it.
 */
export default function Menu({
  items,
  trigger,
  triggerProps,
  align = "left",
  label,
  className,
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    const pad = 8;
    const gap = 4;
    const update = () => {
      const btn = rootRef.current?.querySelector("button");
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const menuWidth = menuRef.current?.offsetWidth ?? 176;
      const menuHeight =
        menuRef.current?.offsetHeight ?? Math.max(items.length, 1) * 36 + 8;
      let left = align === "right" ? r.right - menuWidth : r.left;
      left = Math.max(pad, Math.min(left, window.innerWidth - menuWidth - pad));

      const below = r.bottom + gap;
      const above = r.top - gap - menuHeight;
      const fitsBelow = below + menuHeight <= window.innerHeight - pad;
      const fitsAbove = above >= pad;

      let top: number;
      if (fitsBelow) {
        top = below;
      } else if (fitsAbove) {
        top = above;
      } else {
        const spaceBelow = window.innerHeight - r.bottom - gap;
        const spaceAbove = r.top - gap;
        top = spaceAbove > spaceBelow ? above : below;
        top = Math.max(pad, Math.min(top, window.innerHeight - menuHeight - pad));
      }
      setCoords({ top, left });
    };
    update();
    // Second pass once menu is measured
    requestAnimationFrame(update);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, align, items.length]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const { className: triggerClassName, ...restTriggerProps } = triggerProps ?? {};
  const defaultTriggerClass =
    "inline-flex h-6 w-6 items-center justify-center rounded-md p-1.5 text-zinc-500 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800 hover:text-zinc-800 dark:hover:text-slate-100 transition-colors";

  return (
    <div
      className={`relative inline-flex h-6 shrink-0 items-center justify-center ${className ?? ""}`}
      ref={rootRef}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={triggerClassName ?? defaultTriggerClass}
        {...restTriggerProps}
      >
        {trigger ?? (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
          </svg>
        )}
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: "fixed",
              top: coords?.top ?? 0,
              left: coords?.left ?? 0,
              visibility: coords ? "visible" : "hidden",
            }}
            className="z-[200] min-w-[11rem] py-1 rounded-sm border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg ui-v2-fade"
          >
            {items.map((item) => (
              <div key={item.id}>
                {item.separatorBefore && (
                  <hr className="my-1 border-zinc-100 dark:border-slate-800" />
                )}
                <button
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (item.disabled) return;
                    setOpen(false);
                    item.onSelect();
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors disabled:opacity-40 ${
                    item.danger
                      ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                      : "text-zinc-700 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-800"
                  }`}
                >
                  {item.icon && (
                    <span className="shrink-0 w-4 h-4 flex items-center justify-center">{item.icon}</span>
                  )}
                  {item.label}
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
