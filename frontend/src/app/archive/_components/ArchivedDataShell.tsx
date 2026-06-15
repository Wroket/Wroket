"use client";

import Link from "next/link";

import { useLocale } from "@/lib/LocaleContext";

type DataArchiveSection = "documents" | "databases" | "contacts";

const SECTION_TITLE_KEY: Record<DataArchiveSection, string> = {
  documents: "archives.data.documentsTitle",
  databases: "archives.data.databasesTitle",
  contacts: "archives.data.contactsTitle",
};

export default function ArchivedDataShell({
  section,
  children,
}: {
  section: DataArchiveSection | null;
  children: React.ReactNode;
}) {
  const { t } = useLocale();

  return (
    <div className="space-y-4">
      <nav className="text-xs text-zinc-400 dark:text-slate-500" aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/archive/data" className="hover:text-zinc-600 dark:hover:text-slate-300">
              {t("archives.data.hubTitle")}
            </Link>
          </li>
          {section && (
            <>
              <li aria-hidden>›</li>
              <li className="text-zinc-600 dark:text-slate-300 font-medium">{t(SECTION_TITLE_KEY[section])}</li>
            </>
          )}
        </ol>
      </nav>
      {children}
    </div>
  );
}
