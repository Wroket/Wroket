"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "@/lib/LocaleContext";

export interface HelpItem {
  text: string;
}

interface PageHelpButtonProps {
  items: HelpItem[];
  title?: string;
}

export default function PageHelpButton({ items, title }: PageHelpButtonProps) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const updatePos = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 8, left: Math.max(8, rect.right - 288) });
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
        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border transition-colors ${
          open
            ? "bg-amber-100 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300"
            : "bg-white dark:bg-slate-800 border-zinc-200 dark:border-slate-700 text-zinc-500 dark:text-slate-400 hover:border-amber-300 dark:hover:border-amber-700 hover:text-amber-600 dark:hover:text-amber-400"
        }`}
        title={title ?? t("tutorial.helpButton")}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <span className="hidden sm:inline">{t("tutorial.helpButton")}</span>
      </button>

      {open && createPortal(
        <div
          ref={popRef}
          className="fixed z-[9999] w-72 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-zinc-200 dark:border-slate-600 overflow-hidden"
          style={{ top: pos.top, left: pos.left }}
        >
          {title && (
            <div className="px-4 py-2.5 border-b border-zinc-100 dark:border-slate-700 bg-zinc-50 dark:bg-slate-800/80">
              <p className="text-xs font-bold text-zinc-700 dark:text-slate-200 uppercase tracking-wide">{title}</p>
            </div>
          )}
          <ul className="pr-4 pl-7 py-2.5 space-y-1 list-disc list-outside">
            {items.map((item, i) => (
              <li key={i} className="text-[11px] text-zinc-600 dark:text-slate-300 leading-relaxed marker:text-zinc-400 dark:marker:text-slate-500">
                {item.text}
              </li>
            ))}
          </ul>
        </div>,
        document.body,
      )}
    </>
  );
}
