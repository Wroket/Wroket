"use client";

import type { NotePresencePeer } from "@/hooks/useNoteLiveCollab";
import { useLocale } from "@/lib/LocaleContext";

/**
 * Shows who is on the note and whether they have an active text cursor (editing).
 */
export default function NoteCollabPresenceBar({ peers }: { peers: NotePresencePeer[] }) {
  const { t } = useLocale();
  if (peers.length === 0) return null;

  const editing = peers.filter((p) => p.cursor);
  const viewing = peers.filter((p) => !p.cursor);

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-2 border-b border-zinc-200/80 bg-zinc-50/80 px-3 py-1.5 text-[11px] text-zinc-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300"
    >
      <span className="font-medium text-zinc-500 dark:text-slate-400">{t("notes.presenceBarLabel")}</span>
      {editing.map((p) => (
        <span
          key={p.uid}
          className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 font-medium text-sky-900 dark:bg-sky-900/40 dark:text-sky-100"
          title={t("notes.collabCursor").replace("{name}", p.displayName)}
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" aria-hidden />
          {p.displayName}
          <span className="opacity-70">· {t("notes.presenceEditing")}</span>
        </span>
      ))}
      {viewing.map((p) => (
        <span
          key={p.uid}
          className="inline-flex items-center gap-1 rounded-full bg-emerald-100/80 px-2 py-0.5 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100"
        >
          {p.displayName}
        </span>
      ))}
    </div>
  );
}
