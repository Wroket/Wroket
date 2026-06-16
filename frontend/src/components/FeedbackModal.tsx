"use client";

import { useEffect, useRef, useState } from "react";

import { useLocale } from "@/lib/LocaleContext";
import { postFeedback } from "@/lib/api/feedback";
import { useFocusTrap } from "@/lib/useFocusTrap";

const MAX_MESSAGE = 500;

export interface FeedbackModalUser {
  firstName: string;
  lastName: string;
  email: string;
}

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
  user: FeedbackModalUser;
}

function displayName(user: FeedbackModalUser): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email;
}

export default function FeedbackModal({ open, onClose, user }: FeedbackModalProps) {
  const { t, locale } = useLocale();
  const trapRef = useFocusTrap(open);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [ackSent, setAckSent] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void Promise.resolve().then(() => {
      setMessage("");
      setSent(false);
      setAckSent(true);
      setFormError(null);
      setSubmitting(false);
      textareaRef.current?.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, submitting]);

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) {
      setFormError(t("feedback.emptyError"));
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      const result = await postFeedback({ message: trimmed, locale });
      if (result.ok) {
        setAckSent(result.ackSent);
        setSent(true);
        return;
      }
      setFormError(result.message || t("feedback.submitError"));
    } catch {
      setFormError(t("feedback.submitError"));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const name = displayName(user);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-modal-title"
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} aria-hidden="true" />

      <div
        ref={trapRef}
        className="relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl p-6 sm:p-8"
      >
        <button
          type="button"
          onClick={handleClose}
          disabled={submitting}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-slate-200 hover:bg-zinc-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
          aria-label={t("feedback.cancel")}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {sent ? (
          <div className="text-center py-4">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
              <svg className="h-7 w-7 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-slate-50">{t("feedback.successTitle")}</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-slate-400 leading-relaxed">
              {ackSent ? t("feedback.successBody") : t("feedback.successBodyNoAck")}
            </p>
            <button
              type="button"
              onClick={handleClose}
              className="mt-6 inline-flex w-full justify-center rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white font-semibold py-3 px-4 text-sm transition-colors"
            >
              {t("feedback.close")}
            </button>
          </div>
        ) : (
          <>
            <h2 id="feedback-modal-title" className="text-xl font-bold text-zinc-900 dark:text-slate-50 pr-8">
              {t("feedback.title")}
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-slate-400 leading-relaxed">{t("feedback.intro")}</p>

            {formError && (
              <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
                {formError}
              </p>
            )}

            <form onSubmit={(e) => void handleSubmit(e)} className="mt-5 space-y-3">
              <div>
                <label htmlFor="feedback-message" className="sr-only">
                  {t("feedback.placeholder")}
                </label>
                <textarea
                  id="feedback-message"
                  ref={textareaRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE))}
                  maxLength={MAX_MESSAGE}
                  rows={5}
                  required
                  disabled={submitting}
                  placeholder={t("feedback.placeholder")}
                  className="w-full rounded-lg border border-zinc-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 placeholder-zinc-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
                <p className="mt-1 text-right text-[11px] text-zinc-400 dark:text-slate-500">
                  {message.length}/{MAX_MESSAGE}
                </p>
              </div>

              <p className="text-[11px] text-zinc-400 dark:text-slate-500">
                {t("feedback.sentAs")
                  .replace("{name}", name)
                  .replace("{email}", user.email)}
              </p>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={submitting}
                  className="text-sm font-medium text-zinc-500 dark:text-slate-400 hover:text-zinc-700 dark:hover:text-slate-200 px-4 py-2 rounded-lg border border-zinc-200 dark:border-slate-700 transition-colors disabled:opacity-50"
                >
                  {t("feedback.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={submitting || !message.trim()}
                  className="text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                >
                  {submitting ? t("feedback.sending") : t("feedback.send")}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
