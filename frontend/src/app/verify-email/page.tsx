"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { verifyEmailApi } from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";

function VerifyEmailContent() {
  const { t } = useLocale();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      void Promise.resolve().then(() => {
        setStatus("error");
        setErrorMsg(t("verify.error"));
      });
      return;
    }

    verifyEmailApi(token)
      .then(() => setStatus("success"))
      .catch((err) => {
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : t("verify.error"));
      });
  }, [token, t]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-slate-950">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 shadow-lg rounded-2xl px-8 py-10 border border-transparent dark:border-slate-700 text-center">
        <div className="flex flex-col items-center gap-3 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-slate-800 dark:bg-slate-100 flex items-center justify-center shadow-lg">
            <svg className="w-9 h-9" viewBox="0 0 24 24" fill="none">
              <path d="M2 13l4 4 4.5-6" stroke="#10b981" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M11 13l4 4 4.5-6" stroke="#4f46e5" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold">
            <span className="text-slate-800 dark:text-slate-100">Wro</span>
            <span className="text-emerald-500 dark:text-emerald-400">ket</span>
          </h1>
        </div>

        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
          {t("verify.title")}
        </h2>

        {status === "loading" && (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-zinc-500 dark:text-slate-400">{t("verify.verifying")}</p>
          </div>
        )}

        {status === "success" && (
          <div>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
              <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-md px-3 py-2 mb-6">
              {t("verify.success")}
            </p>
            <a
              href="/login"
              className="inline-block rounded-lg bg-emerald-600 dark:bg-emerald-500 px-6 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 dark:hover:bg-emerald-400"
            >
              {t("verify.goToLogin")}
            </a>
          </div>
        )}

        {status === "error" && (
          <div>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-50 dark:bg-red-900/30 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-800 rounded-md px-3 py-2 mb-6">
              {errorMsg}
            </p>
            <a
              href="/login"
              className="inline-block rounded-lg bg-slate-700 dark:bg-slate-600 px-6 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800 dark:hover:bg-slate-500"
            >
              {t("verify.goToLogin")}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-slate-950">
        <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
