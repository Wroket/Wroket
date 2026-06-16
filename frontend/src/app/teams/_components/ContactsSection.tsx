"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import ConfirmDialog from "@/components/ConfirmDialog";
import PageHelpButton from "@/components/PageHelpButton";
import { useToast } from "@/components/Toast";
import { useLocale } from "@/lib/LocaleContext";
import {
  createContact,
  updateContact,
  deleteContact,
  getContacts,
  type Contact,
} from "@/lib/api/contacts";
import { getMe } from "@/lib/api";
import { inviteCollaborator } from "@/lib/api/teams";
import { getImportSourceBadge } from "@/lib/importSourceBadge";
import { formatUserFacingError } from "@/lib/apiErrors";

type ContactFormState = {
  firstName: string;
  lastName: string;
  company: string;
  email: string;
  phone: string;
  tags: string;
  notes: string;
};

const emptyForm = (): ContactFormState => ({
  firstName: "",
  lastName: "",
  company: "",
  email: "",
  phone: "",
  tags: "",
  notes: "",
});

function contactFullName(c: Contact): string {
  return [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || "—";
}

function formFromContact(c: Contact): ContactFormState {
  return {
    firstName: c.firstName,
    lastName: c.lastName,
    company: c.company ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    tags: c.tags.join(", "),
    notes: c.notes ?? "",
  };
}

function parseTagsInput(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

interface ContactsSectionProps {
  onBack: () => void;
}

export default function ContactsSection({ onBack }: ContactsSectionProps) {
  const { t } = useLocale();
  const { toast } = useToast();
  const [hasIntegrations, setHasIntegrations] = useState(false);
  const [myEmail, setMyEmail] = useState<string | null>(null);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ContactFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);

  const editingContact = useMemo(
    () => (editingId ? contacts.find((c) => c.id === editingId) ?? null : null),
    [contacts, editingId],
  );
  const isNotionManaged = editingContact?.externalRef?.provider === "notion";

  const inputCls =
    "w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400";

  const refresh = useCallback(async (q?: string) => {
    try {
      const list = await getContacts(q);
      setContacts(list);
    } catch (err) {
      toast.error(formatUserFacingError(err, "toast.genericError"));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    getMe()
      .then((me) => {
        setHasIntegrations(me.entitlements?.integrations === true);
        setMyEmail(me.email ?? null);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const q = search.trim();
    if (q.length > 0 && q.length < 2) return;
    const timer = setTimeout(() => {
      void refresh(q.length >= 2 ? q : undefined);
    }, 250);
    return () => clearTimeout(timer);
  }, [search, refresh]);

  const filteredLocally = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || q.length >= 2) return contacts;
    return contacts.filter((c) => {
      const hay = [c.firstName, c.lastName, c.company, c.email, c.phone, ...c.tags]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [contacts, search]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (c: Contact) => {
    setEditingId(c.id);
    setForm(formFromContact(c));
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        firstName: form.firstName.trim() || undefined,
        lastName: form.lastName.trim() || undefined,
        company: form.company.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        tags: parseTagsInput(form.tags),
        notes: form.notes.trim() || null,
      };
      if (editingId) {
        const updated = await updateContact(editingId, payload);
        setContacts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        toast.success(t("contacts.saved"));
      } else {
        const created = await createContact(payload);
        setContacts((prev) => [created, ...prev]);
        toast.success(t("contacts.created"));
      }
      closeForm();
    } catch (err) {
      toast.error(formatUserFacingError(err, "toast.genericError"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteContact(deleteTarget.id);
      setContacts((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      if (editingId === deleteTarget.id) closeForm();
      toast.success(t("contacts.deleted"));
    } catch (err) {
      toast.error(formatUserFacingError(err, "toast.genericError"));
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleInviteContact = async (e: React.MouseEvent, contact: Contact) => {
    e.stopPropagation();
    const email = contact.email?.trim();
    if (!email) {
      toast.error(t("contacts.inviteNoEmail"));
      return;
    }
    if (myEmail && email.toLowerCase() === myEmail.toLowerCase()) {
      toast.error(t("contacts.inviteSelf"));
      return;
    }
    setInvitingId(contact.id);
    try {
      const collab = await inviteCollaborator(email);
      if (collab.status === "active") {
        toast.success(t("contacts.inviteAlreadyActive"));
      } else {
        toast.success(t("contacts.inviteSent").replace("{name}", contactFullName(contact)));
      }
    } catch (err) {
      toast.error(formatUserFacingError(err, "toast.genericError"));
    } finally {
      setInvitingId(null);
    }
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="rounded-md p-2 text-zinc-400 hover:text-zinc-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-zinc-100 dark:hover:bg-slate-800 transition-colors"
            aria-label={t("projects.backToList")}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-zinc-900 dark:text-slate-100">{t("contacts.title")}</h2>
              <PageHelpButton helpId="collaboration.contacts" />
            </div>
            <p className="text-xs text-zinc-400 dark:text-slate-500">
              {contacts.length} {t("contacts.countLabel").toLowerCase()}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-md bg-slate-700 dark:bg-slate-600 px-4 py-2.5 text-sm font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {t("contacts.add")}
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("contacts.searchPlaceholder")}
          className={`${inputCls} sm:max-w-xs`}
        />
        {hasIntegrations && (
          <Link
            href="/migrate/notion?mode=contacts"
            className="inline-flex items-center justify-center text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline px-1"
          >
            {t("contacts.importNotion")}
          </Link>
        )}
      </div>

      {showForm && (
        <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-slate-200">
            {editingId ? t("contacts.editTitle") : t("contacts.addTitle")}
          </h3>
          {isNotionManaged && (
            <p className="text-[10px] text-amber-700 dark:text-amber-400">{t("contacts.managedByNotion")}</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("contacts.firstName")}</label>
              <input type="text" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("contacts.lastName")}</label>
              <input type="text" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("contacts.company")}</label>
              <input type="text" value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("contacts.email")}</label>
              <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("contacts.phone")}</label>
              <input type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("contacts.tags")}</label>
              <input type="text" value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder={t("contacts.tagsPlaceholder")} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("contacts.notes")}</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder={t("contacts.notesPlaceholder")}
              rows={3}
              className={inputCls}
            />
          </div>
          <p className="text-[10px] text-zinc-400 dark:text-slate-500">{t("contacts.identityHint")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="rounded-md bg-slate-700 dark:bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? t("settings.saving") : t("contacts.save")}
            </button>
            <button type="button" onClick={closeForm} className="rounded-md border border-zinc-300 dark:border-slate-600 px-4 py-2 text-sm text-zinc-600 dark:text-slate-300">
              {t("teams.cancel")}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  const c = contacts.find((x) => x.id === editingId);
                  if (c) setDeleteTarget(c);
                }}
                className="ml-auto text-sm text-red-600 dark:text-red-400 hover:underline"
              >
                {t("contacts.delete")}
              </button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredLocally.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-10 text-center">
          <p className="text-sm text-zinc-500 dark:text-slate-400">{t("contacts.empty")}</p>
          <button type="button" onClick={openCreate} className="mt-4 text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:underline">
            {t("contacts.add")}
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-slate-800 bg-zinc-50/80 dark:bg-slate-800/40">
                  <th className="text-left text-xs font-medium text-zinc-500 dark:text-slate-400 px-4 py-2">{t("contacts.colName")}</th>
                  <th className="text-left text-xs font-medium text-zinc-500 dark:text-slate-400 px-4 py-2 hidden sm:table-cell">{t("contacts.company")}</th>
                  <th className="text-left text-xs font-medium text-zinc-500 dark:text-slate-400 px-4 py-2 hidden md:table-cell">{t("contacts.email")}</th>
                  <th className="text-left text-xs font-medium text-zinc-500 dark:text-slate-400 px-4 py-2 hidden lg:table-cell">{t("contacts.phone")}</th>
                  <th className="text-left text-xs font-medium text-zinc-500 dark:text-slate-400 px-4 py-2 hidden xl:table-cell">{t("contacts.tags")}</th>
                  <th className="text-right text-xs font-medium text-zinc-500 dark:text-slate-400 px-4 py-2 w-[88px]">{t("contacts.colActions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-slate-800">
                {filteredLocally.map((c) => {
                  const badge = getImportSourceBadge(c);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => openEdit(c)}
                      className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-medium text-zinc-900 dark:text-slate-100 truncate">{contactFullName(c)}</span>
                          {badge && (
                            <span className={`shrink-0 text-[8px] font-semibold px-1 py-0.5 rounded-full ${badge.className}`}>
                              {t(badge.labelKey)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-slate-400 hidden sm:table-cell truncate max-w-[140px]">{c.company ?? "—"}</td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-slate-400 hidden md:table-cell truncate max-w-[180px]">{c.email ?? "—"}</td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-slate-400 hidden lg:table-cell">{c.phone ?? "—"}</td>
                      <td className="px-4 py-3 hidden xl:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {c.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          disabled={!c.email?.trim() || invitingId === c.id}
                          title={!c.email?.trim() ? t("contacts.inviteNoEmail") : undefined}
                          onClick={(e) => void handleInviteContact(e, c)}
                          className="rounded-md bg-slate-700 dark:bg-slate-600 px-2.5 py-1 text-[11px] font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          {invitingId === c.id ? "…" : t("contacts.invite")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title={t("contacts.deleteTitle")}
        message={t("contacts.deleteConfirm").replace("{name}", deleteTarget ? contactFullName(deleteTarget) : "")}
        confirmLabel={t("contacts.delete")}
        cancelLabel={t("teams.cancel")}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
        variant="danger"
      />
    </>
  );
}
