"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { WroketLockup } from "@/components/brand/WroketBrand";
import { useLocale } from "@/lib/LocaleContext";
import { getClientPortalHub, type ClientPortalHubView } from "@/lib/api/clientPortal";

export default function ClientPortalHubPage() {
  const { t } = useLocale();
  const params = useParams();
  const token = typeof params?.token === "string" ? decodeURIComponent(params.token) : "";
  const [view, setView] = useState<ClientPortalHubView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const hub = await getClientPortalHub(token);
        if (!cancelled) setView(hub);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t("share.invalidLink"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, t]);

  const title = useMemo(
    () => view?.branding.displayName || view?.label || t("portal.hubTitle"),
    [view, t],
  );

  const accent = view?.branding.accentColor || undefined;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-slate-950 text-zinc-900 dark:text-slate-100">
      <header
        className="border-b border-zinc-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-4"
        style={accent ? { borderBottomColor: accent } : undefined}
      >
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          {view?.branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={view.branding.logoUrl} alt="" className="h-8 max-w-[160px] object-contain" />
          ) : (
            <WroketLockup />
          )}
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            {t("portal.publicBadge")}
          </span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {error && (
          <p className="text-center text-sm text-red-600 dark:text-red-400 py-12">{error}</p>
        )}
        {!loading && !error && view && (
          <>
            <h1 className="text-2xl font-bold mb-1">{title}</h1>
            <p className="text-sm text-zinc-500 dark:text-slate-400 mb-6">{t("portal.hubSubtitle")}</p>
            {view.projects.length === 0 ? (
              <p className="text-sm text-zinc-500">{t("portal.noProjects")}</p>
            ) : (
              <ul className="space-y-3">
                {view.projects.map((p) => (
                  <li key={p.token}>
                    <Link
                      href={`/share/portal/${encodeURIComponent(token)}/project/${encodeURIComponent(p.token)}`}
                      className="block rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 hover:border-emerald-400 dark:hover:border-emerald-600 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{p.projectName}</p>
                          {p.projectDescription ? (
                            <p className="text-xs text-zinc-500 dark:text-slate-400 line-clamp-2 mt-0.5">
                              {p.projectDescription}
                            </p>
                          ) : null}
                        </div>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-zinc-100 dark:bg-slate-800 shrink-0">
                          {p.healthLabel}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-2">
                        {p.taskCount} {t("portal.tasks")}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {view.expiresAt && (
              <p className="text-[11px] text-zinc-400 mt-8 text-center">
                {t("share.expiresAt")} {new Date(view.expiresAt).toLocaleDateString()}
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
