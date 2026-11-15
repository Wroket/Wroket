"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import { WroketMark } from "@/components/brand/WroketBrand";
import {
  authorizeExtension,
  isAllowedExtensionRedirectUri,
} from "@/lib/api/extension";
import { useLocale } from "@/lib/LocaleContext";
import { formatUserFacingError } from "@/lib/apiErrors";

/**
 * Chrome extension PKCE consent page.
 * Opened by chrome.identity.launchWebAuthFlow; redirects to chromiumapp.org?code=…
 */
function ExtensionConnectInner() {
  const { t } = useLocale();
  const { user, loading } = useAuth();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const codeChallenge = (params.get("code_challenge") ?? "").trim();
  const redirectUri = (params.get("redirect_uri") ?? "").trim();
  const browserName = (params.get("browser_name") ?? "Chrome").trim().slice(0, 64);

  const valid = useMemo(() => {
    if (!codeChallenge || !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)) return false;
    if (!redirectUri || !isAllowedExtensionRedirectUri(redirectUri)) return false;
    return true;
  }, [codeChallenge, redirectUri]);

  const handleAllow = useCallback(async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { code } = await authorizeExtension({
        codeChallenge,
        redirectUri,
        browserName,
      });
      const target = new URL(redirectUri);
      target.searchParams.set("code", code);
      window.location.assign(target.toString());
    } catch (e) {
      setError(formatUserFacingError(e, "toast.genericError"));
      setBusy(false);
    }
  }, [valid, busy, codeChallenge, redirectUri, browserName]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-slate-950">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-slate-950 px-4">
        <p className="text-sm text-zinc-600 dark:text-slate-300">{t("extConnect.redirectLogin")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-slate-950 px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm">
        <div className="mb-5">
          <WroketMark size={36} />
        </div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-slate-100">
          {t("extConnect.title")}
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-slate-300">{t("extConnect.body")}</p>
        <ul className="mt-3 space-y-1.5 text-sm text-zinc-700 dark:text-slate-200 list-disc pl-5">
          <li>{t("extConnect.permTasks")}</li>
          <li>{t("extConnect.permNotes")}</li>
          <li>{t("extConnect.permProjects")}</li>
        </ul>
        <p className="mt-3 text-xs text-zinc-500 dark:text-slate-400">
          {t("extConnect.browserLabel")}: <span className="font-medium text-zinc-800 dark:text-slate-200">{browserName}</span>
          {" · "}
          {user.email}
        </p>

        {!valid && (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400" role="alert">
            {t("extConnect.invalidParams")}
          </p>
        )}
        {error && (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <Link
            href="/settings?tab=integrations"
            className="inline-flex justify-center rounded-lg border border-zinc-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-800"
          >
            {t("extConnect.cancel")}
          </Link>
          <button
            type="button"
            disabled={!valid || busy}
            onClick={() => void handleAllow()}
            className="inline-flex justify-center rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium"
          >
            {busy ? "…" : t("extConnect.allow")}
          </button>
        </div>
        <p className="mt-4 text-[11px] text-zinc-400 dark:text-slate-500">
          {t("extConnect.revokeHint")}{" "}
          <Link href="/settings?tab=integrations" className="underline hover:text-emerald-600">
            {t("extConnect.settingsLink")}
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

export default function ExtensionConnectPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-slate-950">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <ExtensionConnectInner />
    </Suspense>
  );
}
