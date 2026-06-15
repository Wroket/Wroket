"use client";

import Link from "next/link";

import { useLocale } from "@/lib/LocaleContext";

const TILES = [
  {
    section: "documents" as const,
    titleKey: "archives.data.documentsTitle",
    hintKey: "archives.data.documentsTileHint",
    href: "/archive/data/documents",
    accent: "border-indigo-200 dark:border-indigo-800 bg-indigo-50/80 dark:bg-indigo-950/30 hover:border-indigo-400",
  },
  {
    section: "databases" as const,
    titleKey: "archives.data.databasesTitle",
    hintKey: "archives.data.databasesTileHint",
    href: "/archive/data/databases",
    accent: "border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-emerald-400 dark:hover:border-emerald-600",
  },
  {
    section: "contacts" as const,
    titleKey: "archives.data.contactsTitle",
    hintKey: "archives.data.contactsTileHint",
    href: "/archive/data/contacts",
    accent: "border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-emerald-400 dark:hover:border-emerald-600",
  },
];

export default function ArchivedDataHub() {
  const { t } = useLocale();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-slate-100">{t("archives.data.hubTitle")}</h1>
          <p className="text-sm text-zinc-500 dark:text-slate-400 mt-1">{t("archives.data.hubSubtitle")}</p>
        </div>
        <Link
          href="/notes"
          className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline shrink-0"
        >
          ← {t("nav.notes")}
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TILES.map((tile) => (
          <Link
            key={tile.section}
            href={tile.href}
            className={`text-left rounded-xl border p-4 shadow-sm transition-colors min-h-[120px] flex flex-col ${tile.accent}`}
          >
            <span className="text-lg font-semibold text-zinc-900 dark:text-slate-100">{t(tile.titleKey)}</span>
            <span className="text-sm text-zinc-500 dark:text-slate-400 mt-2">{t(tile.hintKey)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
