"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "@/lib/LocaleContext";
import { PAGE_HELP, type PageHelpId } from "@/lib/pageHelpConfigs";

export interface HelpItem {
  icon?: string;
  text: string;
}

interface PageHelpButtonProps {
  /** Resolves title and items from centralized config. */
  helpId?: PageHelpId;
  items?: HelpItem[];
  title?: string;
  /** Compact control (e.g. narrow notes sidebar); label in title + screen reader only. */
  iconOnly?: boolean;
}

const POPOVER_WIDTH = 256;

export default function PageHelpButton({ helpId, items: itemsProp, title: titleProp, iconOnly }: PageHelpButtonProps) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const { title, items } = useMemo(() => {
    if (helpId) {
      const config = PAGE_HELP[helpId];
      return {
        title: t(config.titleKey),
        items: config.itemKeys.map((key): HelpItem => ({ text: t(key) })),
      };
    }
    return { title: titleProp, items: itemsProp ?? [] };
  }, [helpId, titleProp, itemsProp, t]);

  const updatePos = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 8, left: Math.max(8, rect.right - POPOVER_WIDTH) });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || popRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [open, updatePos]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={iconOnly ? (title ?? t("tutorial.helpButton")) : undefined}
        className={`inline-flex items-center justify-center rounded-sm border text-xs font-medium transition-colors ${
          iconOnly ? "gap-0 p-1.5" : "gap-1.5 px-2.5 py-1.5"
        } ${
          open
            ? "bg-teal-50 dark:bg-teal-950/40 border-teal-300 dark:border-teal-700 text-teal-800 dark:text-teal-300"
            : "bg-white dark:bg-slate-900 border-zinc-200 dark:border-slate-700 text-zinc-500 dark:text-slate-400 hover:border-teal-300 dark:hover:border-teal-700 hover:text-teal-700 dark:hover:text-teal-300"
        }`}
        title={title ?? t("tutorial.helpButton")}
      >
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
        </svg>
        {iconOnly ? (
          <span className="sr-only">{t("tutorial.helpButton")}</span>
        ) : (
          <span className="hidden sm:inline">{t("tutorial.helpButton")}</span>
        )}
      </button>

      {open && createPortal(
        <div
          ref={popRef}
          role="dialog"
          aria-label={title ?? t("tutorial.helpButton")}
          className="fixed z-[9999] w-64 bg-white dark:bg-slate-900 rounded-sm shadow-lg border border-zinc-200 dark:border-slate-700 overflow-hidden ui-v2-fade"
          style={{ top: pos.top, left: pos.left }}
        >
          {title && (
            <div className="px-4 py-2.5 border-b border-zinc-100 dark:border-slate-800">
              <p className="text-[11px] font-medium uppercase tracking-wide text-teal-700 dark:text-teal-400">{title}</p>
            </div>
          )}
          <ul className="pr-4 pl-7 py-2.5 space-y-0.5 list-disc list-outside">
            {items.map((item, i) => (
              <li key={i} className="text-[11px] text-zinc-600 dark:text-slate-300 leading-relaxed marker:text-teal-500 dark:marker:text-teal-600">
                {item.icon && <span className="mr-1">{item.icon}</span>}{item.text}
              </li>
            ))}
          </ul>
        </div>,
        document.body,
      )}
    </>
  );
}
