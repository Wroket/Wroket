"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import ConfirmDialog from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import {
  getArchivedContacts,
  purgeArchivedContact,
  restoreArchivedContact,
  type Contact,
} from "@/lib/api/contacts";
import { useLocale } from "@/lib/LocaleContext";
import ArchivedDataShell from "./ArchivedDataShell";

function contactLabel(c: Contact): string {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return name || c.email || c.phone || "—";
}

export default function ArchivedContactsPanel() {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [purgeId, setPurgeId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setContacts(await getArchivedContacts());
    } catch {
      toast.error(t("toast.loadError"));
      setContacts([]);
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
      await restoreArchivedContact(id);
      setContacts((prev) => prev.filter((c) => c.id !== id));
      toast.success(t("archives.data.contactsRestored"));
    } catch {
      toast.error(t("toast.restoreError"));
    }
  };

  const onPurge = async () => {
    if (!purgeId) return;
    const id = purgeId;
    setPurgeId(null);
    try {
      await purgeArchivedContact(id);
      setContacts((prev) => prev.filter((c) => c.id !== id));
    } catch {
      toast.error(t("toast.deleteError"));
    }
  };

  if (loading) {
    return (
      <ArchivedDataShell section="contacts">
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
        </div>
      </ArchivedDataShell>
    );
  }

  return (
    <ArchivedDataShell section="contacts">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-slate-100">{t("archives.data.contactsTitle")}</h1>
          <p className="text-sm text-zinc-500 dark:text-slate-400 mt-1">{t("archives.data.contactsSubtitle")}</p>
        </div>
        <Link
          href="/teams?section=contacts"
          className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline shrink-0"
        >
          {t("archives.data.openContacts")}
        </Link>
      </div>

      {contacts.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-8 text-center">
          <p className="text-sm text-zinc-400 dark:text-slate-500">{t("archives.data.contactsEmpty")}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {contacts.map((c) => (
            <li
              key={c.id}
              className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between bg-white dark:bg-slate-900 rounded-lg border border-zinc-200 dark:border-slate-700 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-zinc-900 dark:text-slate-100 truncate">{contactLabel(c)}</p>
                {c.email && (
                  <p className="text-xs text-zinc-500 dark:text-slate-400 truncate">{c.email}</p>
                )}
                <p className="text-[11px] text-zinc-400 dark:text-slate-500 mt-0.5">
                  {t("notes.archivedAt")} {formatArchived(c.archivedAt ?? c.updatedAt)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void onRestore(c.id)}
                  className="rounded-lg border border-blue-500 dark:border-blue-400 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                >
                  {t("projects.restore")}
                </button>
                <button
                  type="button"
                  onClick={() => setPurgeId(c.id)}
                  className="rounded-lg border border-red-200 dark:border-red-900/50 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  {t("notes.purge")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={purgeId !== null}
        title={t("notes.purge")}
        message={t("archives.data.contactsPurgeConfirm")}
        onConfirm={() => void onPurge()}
        onCancel={() => setPurgeId(null)}
        variant="danger"
      />
    </ArchivedDataShell>
  );
}
