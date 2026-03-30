"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { resetPasswordApi } from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";

function ResetPasswordContent() {
  const { t } = useLocale();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("wroket-dark");
    if (stored === "1") document.documentElement.classList.add("dark");
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError(t("reset.tooShort"));
      return;
    }
    if (password !== confirm) {
      setError(t("reset.mismatch"));
      return;
    }
    if (!token) {
      setError("Token manquant");
      return;
    }

    setLoading(true);
    try {
      await resetPasswordApi(token, password);
      setDone(true);
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
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{t("reset.title")}</h1>
        </div>

        {done ? (
          <div>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
              <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-md px-3 py-3 mb-6 text-center">
              {t("reset.success")}
            </p>
            <a
              href="/login"
              className="block text-center rounded-lg bg-emerald-600 dark:bg-emerald-500 px-6 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 dark:hover:bg-emerald-400"
            >
              {t("verify.goToLogin")}
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-zinc-700 dark:text-slate-300">
                {t("reset.newPassword")}
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400"
              />
            </div>
            <div>
              <label htmlFor="confirm" className="block text-sm font-medium text-zinc-700 dark:text-slate-300">
                {t("reset.confirmPassword")}
              </label>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400"
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
              {loading ? t("reset.submitting") : t("reset.submit")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-slate-950">
        <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
