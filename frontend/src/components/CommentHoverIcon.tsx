"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useLocale } from "@/lib/LocaleContext";
import { getComments } from "@/lib/api";
import type { Comment } from "@/lib/api";
import type { TranslationKey } from "@/lib/i18n";

interface CommentHoverIconProps {
  todoId: string;
  commentCount: number;
  onClick?: () => void;
  /** Icon size class, defaults to "w-3.5 h-3.5" */
  iconSize?: string;
  /** Button size class for list view, defaults to none */
  buttonClass?: string;
}

export default function CommentHoverIcon({
  todoId,
  commentCount,
  onClick,
  iconSize = "w-3.5 h-3.5",
  buttonClass,
}: CommentHoverIconProps) {
  const { t } = useLocale();
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [popupPos, setPopupPos] = useState<{ top: number; left: number; above: boolean } | null>(null);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iconRef = useRef<HTMLButtonElement>(null);

  const loadComments = useCallback(async () => {
    if (commentsLoaded) return;
    try {
      const c = await getComments(todoId);
      setComments(c);
    } catch { /* ignore */ }
    setCommentsLoaded(true);
  }, [todoId, commentsLoaded]);

  const handleMouseEnter = () => {
    hoverTimeout.current = setTimeout(() => {
      if (iconRef.current) {
        const rect = iconRef.current.getBoundingClientRect();
        const popupW = 288;
        let left = rect.right - popupW;
        if (left < 8) left = 8;
        if (left + popupW > window.innerWidth - 8) left = window.innerWidth - popupW - 8;
        const above = rect.top > 270;
        const top = above ? rect.top - 8 : rect.bottom + 8;
        setPopupPos({ top, left, above });
      }
      setShowComments(true);
      loadComments();
    }, 300);
  };

  const handleMouseLeave = () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    setShowComments(false);
    setPopupPos(null);
  };

  useEffect(() => {
    return () => { if (hoverTimeout.current) clearTimeout(hoverTimeout.current); };
  }, []);

  const defaultBtnCls = "relative text-zinc-300 dark:text-slate-600 hover:text-blue-500 dark:hover:text-blue-400";

  return (
    <>
      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <button
          ref={iconRef}
          type="button"
          onClick={(e) => { e.stopPropagation(); onClick?.(); }}
          className={buttonClass ?? defaultBtnCls}
          aria-label={t("comments.title" as TranslationKey)}
          title={t("comments.title" as TranslationKey)}
        >
          <svg className={iconSize} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
          {commentCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-blue-500 text-white text-[8px] font-bold leading-none px-0.5">
              {commentCount}
            </span>
          )}
        </button>
      </div>
      {showComments && popupPos && typeof document !== "undefined" && createPortal(
        <div
          style={{
            position: "fixed",
            top: popupPos.top,
            left: popupPos.left,
            transform: popupPos.above ? "translateY(-100%)" : "translateY(0)",
          }}
          className="w-72 max-h-64 bg-white dark:bg-slate-800 border border-zinc-200 dark:border-slate-600 rounded-lg shadow-xl z-[9999] overflow-hidden"
          onMouseEnter={() => { if (hoverTimeout.current) clearTimeout(hoverTimeout.current); }}
          onMouseLeave={handleMouseLeave}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 border-b border-zinc-100 dark:border-slate-700 flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-700 dark:text-slate-200">{t("comments.title" as TranslationKey)}</span>
            <span className="text-[10px] text-zinc-400 dark:text-slate-500">{comments.length || commentCount}</span>
          </div>
          <div className="overflow-y-auto max-h-48 p-2 space-y-2">
            {!commentsLoaded ? (
              <p className="text-xs text-zinc-400 dark:text-slate-500 text-center py-3">{t("loading")}</p>
            ) : comments.length === 0 ? (
              <p className="text-xs text-zinc-400 dark:text-slate-500 text-center py-3">{t("comments.empty" as TranslationKey)}</p>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="text-xs">
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="font-medium text-zinc-700 dark:text-slate-300 truncate">{c.userEmail.split("@")[0]}</span>
                    <span className="text-zinc-400 dark:text-slate-500 text-[10px] shrink-0">
                      {new Date(c.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-zinc-600 dark:text-slate-400 break-words">{c.text}</p>
                  {c.reactions && Object.keys(c.reactions).length > 0 && (
                    <div className="flex gap-1 mt-0.5">
                      {Object.entries(c.reactions).map(([emoji, users]) => (
                        <span key={emoji} className="text-[10px] bg-zinc-100 dark:bg-slate-700 rounded px-1 py-0.5">{emoji} {users.length}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
