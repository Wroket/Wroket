"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  listExtensionBrowsers,
  revokeExtensionBrowser,
} from "@/lib/api/extension";
import type { ApiKeyPublic } from "@/lib/api/apiKeys";
import { useLocale } from "@/lib/LocaleContext";
import { useToast } from "@/components/Toast";

/**
 * Settings → Intégrations → Navigateurs (Chrome extension keys).
 */
export default function BrowsersConnectPanel() {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const [browsers, setBrowsers] = useState<ApiKeyPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const list = await listExtensionBrowsers();
    setBrowsers(list);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : t("toast.genericError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, t, toast]);

  const handleRevoke = async (id: string) => {
    setRevokingId(id);
    try {
      await revokeExtensionBrowser(id);
      setConfirmId(null);
      await refresh();
      toast.success(t("settings.browsersRevoked"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.genericError"));
    } finally {
      setRevokingId(null);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(locale === "fr" ? "fr-FR" : "en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-600 dark:text-slate-300">{t("settings.browsersIntro")}</p>
      <p className="text-xs text-zinc-500 dark:text-slate-400">
        {t("settings.browsersInstallHint")}{" "}
        <Link href="/docs" className="text-emerald-700 dark:text-emerald-400 hover:underline">
          docs/chrome-extension.md
        </Link>
      </p>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : browsers.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-slate-400">{t("settings.browsersEmpty")}</p>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-slate-700 rounded-lg border border-zinc-200 dark:border-slate-700 overflow-hidden">
          {browsers.map((b) => (
            <li
              key={b.id}
              className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between px-4 py-3 bg-white dark:bg-slate-900"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-900 dark:text-slate-100 truncate">{b.name}</p>
                <p className="text-[11px] text-zinc-500 dark:text-slate-400">
                  {b.prefix}… · {t("settings.agentLastUsed")}:{" "}
                  {b.lastUsedAt ? formatDate(b.lastUsedAt) : t("settings.agentNeverUsed")}
                </p>
              </div>
              {confirmId === b.id ? (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-zinc-600 dark:text-slate-300">{t("settings.browsersRevokeConfirm")}</span>
                  <button
                    type="button"
                    disabled={revokingId === b.id}
                    onClick={() => void handleRevoke(b.id)}
                    className="rounded bg-red-600 text-white text-xs px-2.5 py-1 font-medium hover:bg-red-700 disabled:opacity-50"
                  >
                    {revokingId === b.id ? "…" : t("settings.agentRevoke")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmId(null)}
                    className="text-xs text-zinc-500 hover:underline"
                  >
                    {t("extConnect.cancel")}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmId(b.id)}
                  className="shrink-0 text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
                >
                  {t("settings.browsersDisconnect")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-zinc-400 dark:text-slate-500">{t("settings.browsersLimitHint")}</p>
    </div>
  );
}
