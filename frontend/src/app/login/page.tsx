"use client";

import { FormEvent, useEffect, useState } from "react";

import Link from "next/link";

import {
  getMe,
  getGoogleSsoUrl,
  login,
  register,
  resendVerificationApi,
  verifyTwoFactor,
  fetchPendingTwoFactorMeta,
  sendEmailOtpForPendingLogin,
  type TwoFactorMethod,
} from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";

type Mode = "login" | "register";

export default function LoginPage() {
  const { t } = useLocale();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resending, setResending] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [twoFaPendingToken, setTwoFaPendingToken] = useState<string | null>(null);
  const [twoFactorMethods, setTwoFactorMethods] = useState<TwoFactorMethod[] | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [emailOtpSending, setEmailOtpSending] = useState(false);
  const [emailOtpSent, setEmailOtpSent] = useState(false);

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

  useEffect(() => {
    let params = new URLSearchParams(window.location.search);
    const pending2fa = params.get("pending2fa");

    if (params.get("error") === "google_sso_failed") {
      setError(t("login.googleSsoError"));
      params.delete("error");
      const q = params.toString();
      window.history.replaceState({}, "", q ? `/login?${q}` : "/login");
      params = new URLSearchParams(window.location.search);
    }

    if (pending2fa) {
      setTwoFaPendingToken(pending2fa);
      setTotpCode("");
      setError(null);
      setEmailOtpSent(false);
      fetchPendingTwoFactorMeta(pending2fa)
        .then((m) => setTwoFactorMethods(m))
        .catch(() => setTwoFactorMethods(["totp"]));
      params = new URLSearchParams(window.location.search);
      params.delete("pending2fa");
      const q = params.toString();
      window.history.replaceState({}, "", q ? `/login?${q}` : "/login");
    }
  }, [t]);

  const exitTwoFa = () => {
    setTwoFaPendingToken(null);
    setTwoFactorMethods(null);
    setTotpCode("");
    setError(null);
    setEmailOtpSent(false);
  };

  const handleSendEmailOtp = async () => {
    if (!twoFaPendingToken) return;
    setError(null);
    setEmailOtpSending(true);
    try {
      await sendEmailOtpForPendingLogin(twoFaPendingToken);
      setEmailOtpSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("login.error"));
    } finally {
      setEmailOtpSending(false);
    }
  };

  const handleSubmitTwoFa = async (event: FormEvent) => {
    event.preventDefault();
    if (!twoFaPendingToken) return;
    setError(null);
    setLoading(true);
    try {
      await verifyTwoFactor(twoFaPendingToken, totpCode);
      const me = await getMe();
      if (me?.email) localStorage.setItem("wroket-login-email", me.email);
      window.location.href = "/dashboard";
    } catch (e) {
      setError(e instanceof Error ? e.message : t("login.error"));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSso = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      document.cookie = `tz=${encodeURIComponent(tz)};path=/;max-age=300;SameSite=Lax`;
      const hint = localStorage.getItem("wroket-login-email") ?? undefined;
      const url = await getGoogleSsoUrl(hint);
      window.location.href = url;
    } catch {
      setError(t("login.googleSsoError"));
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (mode === "login") {
        const outcome = await login({ email, password });
        if (outcome.status === "needs_two_factor") {
          setTwoFaPendingToken(outcome.pendingToken);
          setTwoFactorMethods(outcome.twoFactorMethods);
          setTotpCode("");
          setEmailOtpSent(false);
          return;
        }
      } else {
        if (password.length < 8) {
          setError(t("login.passwordTooShort"));
          return;
        }
        if (password !== confirmPassword) {
          setError(t("login.passwordMismatch"));
          return;
        }
        await register({ email, password });
        setNeedsVerification(true);
        setSuccess(t("login.verifyEmailSent"));
        return;
      }

      const me = await getMe();
      if (me?.email) localStorage.setItem("wroket-login-email", me.email);
      window.location.href = "/dashboard";
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("login.error");
      if (msg === "EMAIL_NOT_VERIFIED") {
        setNeedsVerification(true);
        setError(t("login.emailNotVerified"));
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const darkToggleButton = (
    <button
      type="button"
      onClick={toggleDarkMode}
      className="fixed top-4 right-4 rounded border border-zinc-200 dark:border-slate-600 p-2 text-zinc-600 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-zinc-50 dark:hover:bg-slate-700 transition-colors"
      aria-label={darkMode ? t("a11y.toggleLightMode") : t("a11y.toggleDarkMode")}
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
  );

  if (twoFaPendingToken) {
    const showTotp = twoFactorMethods?.includes("totp") ?? true;
    const showEmail = twoFactorMethods?.includes("email") ?? false;
    const hint =
      showTotp && showEmail
        ? t("login.twoFactorHintBoth")
        : showEmail && !showTotp
          ? t("login.twoFactorHintEmail")
          : t("login.twoFactorHint");
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-slate-950 transition-colors">
        {darkToggleButton}
        <div className="w-full max-w-md bg-white dark:bg-slate-900 shadow-lg rounded-2xl px-8 py-10 border border-transparent dark:border-slate-700">
          <div className="mb-6">
            <Link href="/" className="flex flex-col items-center gap-3 mb-4 hover:opacity-80 transition-opacity">
              <div className="w-14 h-14 rounded-2xl bg-slate-800 dark:bg-slate-100 flex items-center justify-center shadow-lg">
                <svg className="w-9 h-9" viewBox="0 0 24 24" fill="none">
                  <path d="M2 13l4 4 4.5-6" stroke="#10b981" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M11 13l4 4 4.5-6" stroke="#4f46e5" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M12.4 8l0.7-1" stroke="#10b981" strokeWidth="2.8" strokeLinecap="round" />
                  <path d="M21.4 8l0.7-1" stroke="#4f46e5" strokeWidth="2.8" strokeLinecap="round" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold">
                <span className="text-slate-800 dark:text-slate-100">Wro</span><span className="text-emerald-500 dark:text-emerald-400">ket</span>
              </h1>
            </Link>
            <h2 className="text-center text-lg font-semibold text-zinc-900 dark:text-slate-100">{t("login.twoFactorTitle")}</h2>
            <p className="text-center text-sm text-zinc-500 dark:text-slate-400 mt-2">{hint}</p>
          </div>
          <form onSubmit={handleSubmitTwoFa} className="space-y-5">
            {showEmail && (
              <button
                type="button"
                disabled={emailOtpSending || loading}
                onClick={handleSendEmailOtp}
                className="w-full rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/30 px-4 py-2.5 text-sm font-medium text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100/80 dark:hover:bg-emerald-900/40 disabled:opacity-60"
              >
                {emailOtpSending ? t("login.sendingEmailOtp") : t("login.sendEmailOtp")}
              </button>
            )}
            {emailOtpSent && (
              <p className="text-xs text-center text-emerald-700 dark:text-emerald-400">{t("login.emailOtpSentHint")}</p>
            )}
            <div>
              <label htmlFor="totp-code" className="block text-sm font-medium text-zinc-700 dark:text-slate-300">
                {t("settings.security2faCode")}
              </label>
              <input
                id="totp-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={12}
                required
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                className="mt-1 block w-full rounded-lg border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 tracking-widest text-center font-mono shadow-sm focus:border-emerald-500 dark:focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:focus:ring-emerald-400"
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
              className="w-full rounded-lg bg-emerald-600 dark:bg-emerald-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 dark:hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? t("login.twoFactorVerifying") : t("login.twoFactorSubmit")}
            </button>
            <button
              type="button"
              onClick={exitTwoFa}
              disabled={loading}
              className="w-full rounded-lg border border-zinc-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 disabled:opacity-60"
            >
              {t("login.twoFactorBack")}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-slate-950 transition-colors">
      {darkToggleButton}

      <div className="w-full max-w-md bg-white dark:bg-slate-900 shadow-lg rounded-2xl px-8 py-10 border border-transparent dark:border-slate-700">
        <div className="mb-6">
          <Link href="/" className="flex flex-col items-center gap-3 mb-4 hover:opacity-80 transition-opacity">
            <div className="w-14 h-14 rounded-2xl bg-slate-800 dark:bg-slate-100 flex items-center justify-center shadow-lg">
              <svg className="w-9 h-9" viewBox="0 0 24 24" fill="none">
                <path d="M2 13l4 4 4.5-6" stroke="#10b981" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M11 13l4 4 4.5-6" stroke="#4f46e5" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12.4 8l0.7-1" stroke="#10b981" strokeWidth="2.8" strokeLinecap="round" />
                <path d="M21.4 8l0.7-1" stroke="#4f46e5" strokeWidth="2.8" strokeLinecap="round" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold">
              <span className="text-slate-800 dark:text-slate-100">Wro</span><span className="text-emerald-500 dark:text-emerald-400">ket</span>
            </h1>
          </Link>
          <p className="text-center text-sm text-zinc-500 dark:text-slate-400">
            {mode === "login" ? t("login.title") : t("login.register")}
          </p>
          <div className="flex gap-3 mt-4">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
                setSuccess(null);
                setConfirmPassword("");
              }}
              className={`flex-1 rounded-lg border py-2 text-sm font-medium ${
                mode === "login"
                  ? "border-emerald-600 dark:border-emerald-400 bg-emerald-600 dark:bg-emerald-500 text-white"
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
                setConfirmPassword("");
              }}
              className={`flex-1 rounded-lg border py-2 text-sm font-medium ${
                mode === "register"
                  ? "border-emerald-600 dark:border-emerald-400 bg-emerald-600 dark:bg-emerald-500 text-white"
                  : "border-zinc-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-zinc-900 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-700"
              }`}
            >
              {t("login.register")}
            </button>
          </div>
        </div>

        <button
          type="button"
          disabled={googleLoading}
          onClick={handleGoogleSso}
          className="w-full flex items-center justify-center gap-3 rounded-lg border border-zinc-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-slate-200 shadow-sm hover:bg-zinc-50 dark:hover:bg-slate-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 0 0 1 12c0 1.94.46 3.77 1.18 5.07l3.66-2.84z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          {googleLoading ? "..." : t("login.googleSso")}
        </button>

        <div className="relative flex items-center justify-center my-1">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-200 dark:border-slate-700"></div>
          </div>
          <span className="relative bg-white dark:bg-slate-900 px-3 text-xs text-zinc-400 dark:text-slate-500 uppercase">
            {t("login.or")}
          </span>
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
              className="mt-1 block w-full rounded-lg border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 placeholder:text-zinc-400 shadow-sm focus:border-emerald-500 dark:focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:focus:ring-emerald-400"
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
              minLength={mode === "register" ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 placeholder:text-zinc-400 shadow-sm focus:border-emerald-500 dark:focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:focus:ring-emerald-400"
            />
            {mode === "register" && password.length > 0 && password.length < 8 && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{t("login.passwordTooShort")}</p>
            )}
          </div>

          {mode === "register" && (
            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-zinc-700 dark:text-slate-300"
              >
                {t("login.confirmPassword")}
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 placeholder:text-zinc-400 shadow-sm focus:outline-none focus:ring-1 ${
                  confirmPassword && password !== confirmPassword
                    ? "border-red-400 dark:border-red-600 focus:border-red-500 focus:ring-red-500"
                    : "border-zinc-300 dark:border-slate-600 focus:border-emerald-500 dark:focus:border-emerald-400 focus:ring-emerald-500 dark:focus:ring-emerald-400"
                }`}
              />
              {confirmPassword && password !== confirmPassword && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{t("login.passwordMismatch")}</p>
              )}
            </div>
          )}

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

          {needsVerification && email && (
            <button
              type="button"
              disabled={resending}
              onClick={async () => {
                setResending(true);
                try {
                  await resendVerificationApi(email);
                  setSuccess(t("login.resendSuccess"));
                  setError(null);
                } catch (e) {
                  setError(e instanceof Error ? e.message : t("login.error"));
                } finally {
                  setResending(false);
                }
              }}
              className="w-full rounded-lg border border-zinc-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 disabled:opacity-60"
            >
              {resending ? "..." : t("login.resendLink")}
            </button>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-emerald-600 dark:bg-emerald-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 dark:hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading
              ? (mode === "login" ? t("login.submitting") : t("login.creating"))
              : (mode === "login" ? t("login.submit") : t("login.createAccount"))}
          </button>

          {mode === "login" && (
            <a
              href="/forgot-password"
              className="block text-center text-sm text-zinc-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400"
            >
              {t("login.forgotPassword")}
            </a>
          )}
        </form>
      </div>
    </div>
  );
}
