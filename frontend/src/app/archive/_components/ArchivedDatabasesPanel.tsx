"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import ConfirmDialog from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import {
  getArchivedUserDatabases,
  purgeArchivedUserDatabase,
  restoreArchivedUserDatabase,
  type UserDatabase,
} from "@/lib/api/userDatabases";
import { useLocale } from "@/lib/LocaleContext";
import { getImportSourceBadge } from "@/lib/importSourceBadge";
import ArchivedDataShell from "./ArchivedDataShell";

export default function ArchivedDatabasesPanel() {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const [databases, setDatabases] = useState<UserDatabase[]>([]);
  const [loading, setLoading] = useState(true);
  const [purgeId, setPurgeId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDatabases(await getArchivedUserDatabases());
    } catch {
      toast.error(t("toast.loadError"));
      setDatabases([]);
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const formatArchived = (iso: string) =>
    new Date(iso).toLocaleString(locale === "en" ? "en-US" : "fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const onRestore = async (id: string) => {
    try {
      await restoreArchivedUserDatabase(id);
      setDatabases((prev) => prev.filter((d) => d.id !== id));
      toast.success(t("archives.data.databasesRestored"));
    } catch {
      toast.error(t("toast.restoreError"));
    }
  };

  const onPurge = async () => {
    if (!purgeId) return;
    const id = purgeId;
    setPurgeId(null);
    try {
      await purgeArchivedUserDatabase(id);
      setDatabases((prev) => prev.filter((d) => d.id !== id));
    } catch {
      toast.error(t("toast.deleteError"));
    }
  };

  if (loading) {
    return (
      <ArchivedDataShell section="databases">
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
        </div>
      </ArchivedDataShell>
    );
  }

  return (
    <ArchivedDataShell section="databases">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-slate-100">{t("archives.data.databasesTitle")}</h1>
          <p className="text-sm text-zinc-500 dark:text-slate-400 mt-1">{t("archives.data.databasesSubtitle")}</p>
        </div>
        <Link
          href="/notes?section=databases"
          className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline shrink-0"
        >
          {t("archives.data.openDatabases")}
        </Link>
      </div>

      {databases.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-8 text-center">
          <p className="text-sm text-zinc-400 dark:text-slate-500">{t("archives.data.databasesEmpty")}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {databases.map((db) => {
            const badge = getImportSourceBadge(db);
            return (
              <li
                key={db.id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between bg-white dark:bg-slate-900 rounded-lg border border-zinc-200 dark:border-slate-700 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-zinc-900 dark:text-slate-100 truncate flex items-center gap-2">
                    {db.name}
                    {badge && (
                      <span className={`text-[8px] px-1 py-0.5 rounded-full shrink-0 ${badge.className}`}>
                        {t(badge.labelKey)}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-slate-400">
                    {t("archives.data.columnCountShort").replace("{count}", String(db.columns.length))}
                  </p>
                  <p className="text-[11px] text-zinc-400 dark:text-slate-500 mt-0.5">
                    {t("notes.archivedAt")} {formatArchived(db.archivedAt ?? db.updatedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void onRestore(db.id)}
                    className="rounded-lg border border-blue-500 dark:border-blue-400 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                  >
                    {t("projects.restore")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPurgeId(db.id)}
                    className="rounded-lg border border-red-200 dark:border-red-900/50 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    {t("notes.purge")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={purgeId !== null}
        title={t("notes.purge")}
        message={t("archives.data.databasesPurgeConfirm")}
        onConfirm={() => void onPurge()}
        onCancel={() => setPurgeId(null)}
        variant="danger"
      />
    </ArchivedDataShell>
  );
}
