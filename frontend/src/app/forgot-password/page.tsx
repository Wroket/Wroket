"use client";

import { FormEvent, useEffect, useState } from "react";

import { forgotPasswordApi } from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";

export default function ForgotPasswordPage() {
  const { t } = useLocale();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("wroket-dark");
    if (stored === "1") document.documentElement.classList.add("dark");
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await forgotPasswordApi(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("login.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-slate-950">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 shadow-lg rounded-2xl px-8 py-10 border border-transparent dark:border-slate-700">
        <div className="flex flex-col items-center gap-3 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-slate-800 dark:bg-slate-100 flex items-center justify-center shadow-lg">
            <svg className="w-9 h-9" viewBox="0 0 24 24" fill="none">
              <path d="M2 13l4 4 4.5-6" stroke="#10b981" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M11 13l4 4 4.5-6" stroke="#4f46e5" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{t("forgot.title")}</h1>
          <p className="text-sm text-zinc-500 dark:text-slate-400 text-center">{t("forgot.instruction")}</p>
        </div>

        {sent ? (
          <div>
            <p className="text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-md px-3 py-3 mb-6 text-center">
              {t("forgot.success")}
            </p>
            <a
              href="/login"
              className="block text-center rounded-lg border border-zinc-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800"
            >
              {t("forgot.backToLogin")}
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-zinc-700 dark:text-slate-300">
                {t("login.email")}
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 placeholder:text-zinc-400 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-800 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-indigo-600 dark:bg-indigo-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 dark:hover:bg-indigo-400 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? t("forgot.sending") : t("forgot.submit")}
            </button>

            <a
              href="/login"
              className="block text-center text-sm text-zinc-500 dark:text-slate-400 hover:text-zinc-700 dark:hover:text-slate-300"
            >
              {t("forgot.backToLogin")}
            </a>
          </form>
        )}
      </div>
    </div>
  );
}
