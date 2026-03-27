"use client";

import { FormEvent, useEffect, useState } from "react";

import { getMe, login, register } from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";

type Mode = "login" | "register";

export default function LoginPage() {
  const { t } = useLocale();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("wroket-dark");
    if (stored === "1") {
      setDarkMode(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleDarkMode = () => {
    setDarkMode((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("wroket-dark", next ? "1" : "0");
      return next;
    });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (mode === "login") {
        await login({ email, password });
      } else {
        await register({ email, password });
        setMode("login");
        setSuccess(t("login.accountCreated"));
        return;
      }

      await getMe();
      window.location.href = "/dashboard";
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t("login.error")
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-slate-950 transition-colors">
      <button
        onClick={toggleDarkMode}
        className="fixed top-4 right-4 rounded border border-zinc-200 dark:border-slate-600 p-2 text-zinc-600 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-zinc-50 dark:hover:bg-slate-700 transition-colors"
        aria-label="Toggle dark mode"
      >
        {darkMode ? (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        )}
      </button>

      <div className="w-full max-w-md bg-white dark:bg-slate-900 shadow-lg rounded-2xl px-8 py-10 border border-transparent dark:border-slate-700">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-center text-zinc-900 dark:text-slate-100">
            {mode === "login" ? t("login.title") : t("login.register")}
          </h1>
          <div className="flex gap-3 mt-4">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
                setSuccess(null);
              }}
              className={`flex-1 rounded-lg border py-2 text-sm font-medium ${
                mode === "login"
                  ? "border-zinc-900 dark:border-slate-100 bg-zinc-900 dark:bg-slate-100 text-white dark:text-slate-900"
                  : "border-zinc-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-zinc-900 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-700"
              }`}
            >
              {t("login.title")}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError(null);
                setSuccess(null);
              }}
              className={`flex-1 rounded-lg border py-2 text-sm font-medium ${
                mode === "register"
                  ? "border-zinc-900 dark:border-slate-100 bg-zinc-900 dark:bg-slate-100 text-white dark:text-slate-900"
                  : "border-zinc-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-zinc-900 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-700"
              }`}
            >
              {t("login.register")}
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-zinc-700 dark:text-slate-300"
            >
              {t("login.email")}
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 placeholder:text-zinc-400 shadow-sm focus:border-zinc-900 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-slate-400"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-zinc-700 dark:text-slate-300"
            >
              {t("login.password")}
            </label>
            <input
              id="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 placeholder:text-zinc-400 shadow-sm focus:border-zinc-900 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-slate-400"
            />
          </div>

          {success && (
            <p className="text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-md px-3 py-2">
              {success}
            </p>
          )}

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-800 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-zinc-900 dark:bg-slate-100 px-4 py-2 text-sm font-medium text-white dark:text-slate-900 shadow-sm hover:bg-zinc-800 dark:hover:bg-slate-300 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading
              ? (mode === "login" ? t("login.submitting") : t("login.creating"))
              : (mode === "login" ? t("login.submit") : t("login.createAccount"))}
          </button>
        </form>
      </div>
    </div>
  );
}
