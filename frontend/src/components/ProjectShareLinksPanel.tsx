"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useLocale } from "@/lib/LocaleContext";
import { useToast } from "@/components/Toast";
import {
  ALL_SHARE_TABS,
  buildShareProjectUrl,
  createProjectShareLink,
  listProjectShareLinks,
  revokeProjectShareLink,
  type ProjectShareLink,
  type ShareLinkExpiryDays,
  type ShareLinkTab,
} from "@/lib/api/projectShare";

interface Props {
  projectId: string;
  canManage: boolean;
}

const TAB_I18N: Record<ShareLinkTab, "share.publicPilotage" | "projects.kanban" | "gantt.view"> = {
  pilotage: "share.publicPilotage",
  kanban: "projects.kanban",
  gantt: "gantt.view",
};

export default function ProjectShareLinksPanel({ projectId, canManage }: Props) {
  const { t } = useLocale();
  const { toast } = useToast();
  const [links, setLinks] = useState<ProjectShareLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [expiryDays, setExpiryDays] = useState<ShareLinkExpiryDays>(30);
  const [label, setLabel] = useState("");
  const [selectedTabs, setSelectedTabs] = useState<ShareLinkTab[]>([...ALL_SHARE_TABS]);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    if (!canManage) return;
    setLoading(true);
    try {
      const list = await listProjectShareLinks(projectId);
      setLinks(list);
    } catch {
      toast.error(t("share.loadError"));
    } finally {
      setLoading(false);
    }
  }, [canManage, projectId, toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!modalOpen) return;
    cancelBtnRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModalOpen(false);
        return;
      }
      if (e.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [modalOpen]);

  const resetModal = () => {
    setLabel("");
    setExpiryDays(30);
    setSelectedTabs([...ALL_SHARE_TABS]);
  };

  const openCreateModal = () => {
    resetModal();
    setModalOpen(true);
  };

  const toggleTab = (tab: ShareLinkTab) => {
    setSelectedTabs((prev) => {
      if (prev.includes(tab)) {
        if (prev.length === 1) return prev;
        return prev.filter((t) => t !== tab);
      }
      return [...prev, tab];
    });
  };

  const handleCreate = async () => {
    if (selectedTabs.length === 0) {
      toast.error(t("share.tabsRequired"));
      return;
    }
    setCreating(true);
    try {
      const link = await createProjectShareLink(projectId, {
        label: label.trim() || undefined,
        expiryDays,
        tabs: selectedTabs,
      });
      setLinks((prev) => [link, ...prev]);
      setModalOpen(false);
      resetModal();
      toast.success(t("share.created"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("share.createError"));
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (linkId: string) => {
    try {
      await revokeProjectShareLink(projectId, linkId);
      setLinks((prev) => prev.map((l) => (l.id === linkId ? { ...l, revokedAt: new Date().toISOString() } : l)));
      toast.success(t("share.revoked"));
    } catch {
      toast.error(t("share.revokeError"));
    }
  };

  const copyUrl = async (token: string) => {
    try {
      await navigator.clipboard.writeText(buildShareProjectUrl(token));
      toast.success(t("share.copied"));
    } catch {
      toast.error(t("share.copyError"));
    }
  };

  const formatTabs = (tabs?: ShareLinkTab[]) => {
    const resolved = tabs?.length ? tabs : [...ALL_SHARE_TABS];
    return resolved.map((tab) => t(TAB_I18N[tab])).join(" · ");
  };

  if (!canManage) return null;

  const activeLinks = links.filter((l) => !l.revokedAt && (!l.expiresAt || new Date(l.expiresAt) > new Date()));

  return (
    <>
      <div className="rounded-md border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h4 className="text-xs font-semibold text-zinc-500 dark:text-slate-400 uppercase tracking-wider">
              {t("share.title")}
            </h4>
            <p className="text-xs text-zinc-500 dark:text-slate-400 mt-1">{t("share.hint")}</p>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="rounded bg-slate-700 dark:bg-slate-600 text-white text-xs px-3 py-1.5 shrink-0"
          >
            {t("share.create")}
          </button>
        </div>

        {loading && <p className="text-xs text-zinc-400">{t("share.loading")}</p>}

        {activeLinks.length > 0 && (
          <ul className="space-y-2">
            {activeLinks.map((link) => (
              <li
                key={link.id}
                className="flex flex-wrap items-center gap-2 text-xs border border-zinc-100 dark:border-slate-800 rounded px-2 py-1.5"
              >
                <span className="font-medium text-zinc-700 dark:text-slate-300">
                  {link.label || t("share.unnamed")}
                </span>
                <span className="text-zinc-400">{formatTabs(link.allowedTabs)}</span>
                {link.expiresAt && (
                  <span className="text-zinc-400">
                    → {new Date(link.expiresAt).toLocaleDateString()}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void copyUrl(link.token)}
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {t("share.copyLink")}
                </button>
                <button
                  type="button"
                  onClick={() => void handleRevoke(link.id)}
                  className="text-red-600 dark:text-red-400 hover:underline ml-auto"
                >
                  {t("share.revoke")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setModalOpen(false)}
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-create-dialog-title"
            className="relative bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="share-create-dialog-title"
              className="text-lg font-semibold text-zinc-900 dark:text-slate-100"
            >
              {t("share.createModalTitle")}
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-slate-400">{t("share.createModalHint")}</p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs text-zinc-500 dark:text-slate-400 mb-0.5">
                  {t("share.labelOptional")}
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={t("share.labelPlaceholder")}
                  className="w-full rounded border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-sm dark:bg-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-500 dark:text-slate-400 mb-0.5">
                  {t("share.expiry")}
                </label>
                <select
                  value={expiryDays === null ? "never" : String(expiryDays)}
                  onChange={(e) => {
                    const v = e.target.value;
                    setExpiryDays(v === "never" ? null : (Number(v) as ShareLinkExpiryDays));
                  }}
                  className="w-full rounded border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-sm dark:bg-slate-900"
                >
                  <option value="7">7 {t("share.days")}</option>
                  <option value="30">30 {t("share.days")}</option>
                  <option value="90">90 {t("share.days")}</option>
                  <option value="never">{t("share.noExpiry")}</option>
                </select>
              </div>

              <fieldset>
                <legend className="block text-xs text-zinc-500 dark:text-slate-400 mb-1.5">
                  {t("share.tabsLabel")}
                </legend>
                <div className="space-y-2">
                  {ALL_SHARE_TABS.map((tab) => (
                    <label
                      key={tab}
                      className="flex items-center gap-2 text-sm text-zinc-700 dark:text-slate-300 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedTabs.includes(tab)}
                        onChange={() => toggleTab(tab)}
                        className="rounded border-zinc-300 dark:border-slate-600"
                      />
                      {t(TAB_I18N[tab])}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                ref={cancelBtnRef}
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm rounded-md border border-zinc-300 dark:border-slate-600 text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-700 transition-colors"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                disabled={creating || selectedTabs.length === 0}
                onClick={() => void handleCreate()}
                className="px-4 py-2 text-sm rounded-md bg-slate-700 dark:bg-slate-600 text-white disabled:opacity-50 transition-colors"
              >
                {creating ? "…" : t("share.create")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
