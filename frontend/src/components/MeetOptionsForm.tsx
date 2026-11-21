"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "@/lib/LocaleContext";
import type { TranslationKey } from "@/lib/i18n";
import type { Todo } from "@/lib/api";
import { clearTaskMeet, createTaskMeet, getTaskSlots, updateTaskMeet } from "@/lib/api/calendar";
import { ApiClientError, formatUserFacingError } from "@/lib/apiErrors";
import { meetingJoinI18nKey } from "@/lib/meetingJoinLabel";
import { useToast } from "@/components/Toast";
import ContactEmailSuggestInput from "@/components/ContactEmailSuggestInput";

function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const offsetPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+0";
  const match = offsetPart.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] ?? "0");
  const minutes = Number(match[3] ?? "0");
  return sign * (hours * 60 + minutes);
}

function formatIsoForDateTimeInputInZone(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const byType = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${byType("year")}-${byType("month")}-${byType("day")}T${byType("hour")}:${byType("minute")}`;
}

function wallTimeInZoneToIso(value: string, timeZone: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return new Date(value).toISOString();
  const [, y, mo, d, h, mi] = match;
  const utcGuess = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), 0, 0));
  const offsetMinutes = getTimeZoneOffsetMinutes(utcGuess, timeZone);
  const ts =
    Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), 0, 0) - offsetMinutes * 60_000;
  return new Date(ts).toISOString();
}

export function mapMeetErrorToMessageKey(message: string): TranslationKey {
  const msg = message.toLowerCase();
  if (msg.includes("connectez") || msg.includes("non connecté") || msg.includes("connect")) {
    return "meet.errorNoGoogle";
  }
  if (
    msg.includes("invités externes") &&
    (msg.includes("teams") || msg.includes("microsoft") || msg.includes("outlook"))
  ) {
    return "meet.errorExternalInvitePolicyTeams";
  }
  if (msg.includes("invitation") && (msg.includes("outlook") || msg.includes("teams") || msg.includes("microsoft"))) {
    return "meet.errorInviteesTeams";
  }
  if (msg.includes("invités externes") || msg.includes("forbiddenfornonorganizer")) {
    return "meet.errorExternalInvitePolicy";
  }
  if (
    msg.includes("permissions outlook") ||
    msg.includes("permissions google calendar") ||
    (msg.includes("permissions") && !msg.includes("invit"))
  ) {
    return "meet.errorPermissions";
  }
  if (
    msg.includes("calendrier google introuvable") ||
    msg.includes("calendrier outlook") ||
    msg.includes("calendrier par défaut")
  ) {
    return "meet.errorDefaultCalendar";
  }
  if (msg.includes("rejeté") || msg.includes("rejected") || msg.includes("email invalide") || msg.includes("invités")) {
    return "meet.errorInvitees";
  }
  return "meet.error";
}

export interface MeetOptionsFormProps {
  todo: Todo;
  timeZone: string;
  /** Modal: show Cancel + close after save. Embedded: stay on form after save. */
  variant?: "modal" | "embedded";
  onUpdated: (todo: Todo) => void;
  onDismiss?: () => void;
  className?: string;
}

/**
 * Create / update / cancel a Meet or Teams meeting for a task.
 */
export default function MeetOptionsForm({
  todo,
  timeZone,
  variant = "modal",
  onUpdated,
  onDismiss,
  className,
}: MeetOptionsFormProps) {
  const { t } = useLocale();
  const { toast } = useToast();
  const [meetStart, setMeetStart] = useState("");
  const [meetDuration, setMeetDuration] = useState(60);
  const [meetSummary, setMeetSummary] = useState(todo.title);
  const [meetDescription, setMeetDescription] = useState("");
  const [meetInviteEmail, setMeetInviteEmail] = useState("");
  const [meetInvitees, setMeetInvitees] = useState<string[]>(todo.scheduledSlot?.meetingInvitees ?? []);
  const [meetSlotOptions, setMeetSlotOptions] = useState<Array<{ label: string; start: string; end: string }>>([]);
  const [meetSlotLoading, setMeetSlotLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const hydrate = useCallback(
    async (target: Todo) => {
      setMeetInvitees(target.scheduledSlot?.meetingInvitees ?? []);
      setMeetInviteEmail("");
      setMeetDescription("");
      setMeetSummary(target.title);
      setMeetSlotOptions([]);

      if (target.scheduledSlot?.start && target.scheduledSlot?.end) {
        const startDate = new Date(target.scheduledSlot.start);
        const endDate = new Date(target.scheduledSlot.end);
        const durationMin = Math.max(15, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
        setMeetStart(formatIsoForDateTimeInputInZone(target.scheduledSlot.start, timeZone));
        setMeetDuration(durationMin);
        return;
      }

      setMeetSlotLoading(true);
      try {
        const data = await getTaskSlots(target.id);
        const slots = data.slots ?? [];
        setMeetSlotOptions(slots.map((s) => ({ label: s.label, start: s.start, end: s.end })));
        if (slots.length > 0) {
          const start = slots[0]!.start;
          const end = slots[0]!.end;
          const durationMin = Math.max(
            15,
            Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000),
          );
          setMeetStart(formatIsoForDateTimeInputInZone(start, timeZone));
          setMeetDuration(durationMin);
        } else {
          const now = new Date();
          const rounded = new Date(now.getTime() + 15 * 60000 - (now.getTime() % (15 * 60000)));
          setMeetStart(formatIsoForDateTimeInputInZone(rounded.toISOString(), timeZone));
          setMeetDuration(60);
        }
      } catch {
        const now = new Date();
        const rounded = new Date(now.getTime() + 15 * 60000 - (now.getTime() % (15 * 60000)));
        setMeetStart(formatIsoForDateTimeInputInZone(rounded.toISOString(), timeZone));
        setMeetDuration(60);
      } finally {
        setMeetSlotLoading(false);
      }
    },
    [timeZone],
  );

  useEffect(() => {
    void hydrate(todo);
    // Re-init when switching task or when an existing meeting slot changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional narrow deps
  }, [todo.id, todo.scheduledSlot?.meetingUrl, todo.scheduledSlot?.start, todo.scheduledSlot?.end, hydrate]);

  const addMeetInvitee = (emailInput: string) => {
    const email = emailInput.trim().toLowerCase();
    if (!email || !email.includes("@") || email.length < 5) return;
    setMeetInvitees((prev) => (prev.includes(email) ? prev : [...prev, email]));
    setMeetInviteEmail("");
  };

  const handleSave = async () => {
    if (!meetStart) return;
    setSaving(true);
    try {
      const startIso = wallTimeInZoneToIso(meetStart, timeZone);
      const endIso = new Date(new Date(startIso).getTime() + meetDuration * 60000).toISOString();
      const updater = todo.scheduledSlot?.meetingUrl ? updateTaskMeet : createTaskMeet;
      const updated = await updater(todo.id, {
        start: startIso,
        end: endIso,
        attendees: meetInvitees,
        summary: meetSummary.trim() || todo.title,
        description: meetDescription.trim() || undefined,
      });
      onUpdated(updated);
      const meetUrl = updated.scheduledSlot?.meetingUrl;
      if (meetUrl && !todo.scheduledSlot?.meetingUrl) {
        await navigator.clipboard.writeText(meetUrl).catch(() => null);
        toast.success(t("meet.created"));
      } else {
        toast.success(t("meet.updated"));
      }
      if (variant === "modal") onDismiss?.();
    } catch (err) {
      toast.error(
        err instanceof ApiClientError
          ? formatUserFacingError(err, "meet.error")
          : t(mapMeetErrorToMessageKey(err instanceof Error ? err.message : "")),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      const updated = await clearTaskMeet(todo.id);
      onUpdated(updated);
      toast.success(t("meet.cancelled"));
      if (variant === "modal") onDismiss?.();
    } catch (err) {
      toast.error(
        err instanceof ApiClientError
          ? formatUserFacingError(err, "meet.error")
          : t(mapMeetErrorToMessageKey(err instanceof Error ? err.message : "")),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={className}>
      {variant === "modal" && (
        <>
          <h3 className="text-base font-semibold text-zinc-900 dark:text-slate-100">{t("meet.optionsTitle")}</h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-slate-400 truncate">{todo.title}</p>
        </>
      )}

      <div className={variant === "modal" ? "mt-4 space-y-3" : "space-y-3"}>
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
            {t("meet.summary")}
          </label>
          <input
            value={meetSummary}
            onChange={(e) => setMeetSummary(e.target.value)}
            className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
            {t("meet.slot")}
          </label>
          {meetSlotLoading ? (
            <p className="text-xs text-zinc-400 dark:text-slate-500">{t("loading")}</p>
          ) : (
            <div className="space-y-2">
              {meetSlotOptions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {meetSlotOptions.slice(0, 4).map((slot) => (
                    <button
                      key={`${slot.start}-${slot.end}`}
                      type="button"
                      onClick={() => {
                        const durationMin = Math.max(
                          15,
                          Math.round((new Date(slot.end).getTime() - new Date(slot.start).getTime()) / 60000),
                        );
                        setMeetStart(formatIsoForDateTimeInputInZone(slot.start, timeZone));
                        setMeetDuration(durationMin);
                      }}
                      className="text-xs rounded border border-zinc-300 dark:border-slate-600 px-2 py-1 text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800"
                    >
                      {slot.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-zinc-400 dark:text-slate-500 mb-1">
                    {t("meet.start")}
                  </label>
                  <input
                    type="datetime-local"
                    value={meetStart}
                    onChange={(e) => setMeetStart(e.target.value)}
                    className="w-full rounded border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-sm dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 dark:text-slate-500 mb-1">
                    {t("meet.duration")}
                  </label>
                  <select
                    value={meetDuration}
                    onChange={(e) => setMeetDuration(Number(e.target.value))}
                    className="w-full rounded border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-sm dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value={30}>30 min</option>
                    <option value={45}>45 min</option>
                    <option value={60}>60 min</option>
                    <option value={90}>90 min</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
            {t("meet.invitees")}
          </label>
          <div className="flex items-center gap-2">
            <ContactEmailSuggestInput
              value={meetInviteEmail}
              onChange={setMeetInviteEmail}
              placeholder={t("assign.placeholder")}
              inputClassName="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={() => addMeetInvitee(meetInviteEmail)}
              className="rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-xs text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800"
            >
              {t("meet.addInvitee")}
            </button>
          </div>
          {meetInvitees.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {meetInvitees.map((email) => (
                <button
                  key={email}
                  type="button"
                  onClick={() => setMeetInvitees((prev) => prev.filter((e) => e !== email))}
                  className="text-[11px] rounded-full px-2 py-0.5 bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                  title={t("notes.attachDelete")}
                >
                  {email} ×
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
            {t("meet.description")}
          </label>
          <textarea
            value={meetDescription}
            onChange={(e) => setMeetDescription(e.target.value)}
            rows={variant === "embedded" ? 2 : 3}
            className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {variant === "modal" && onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded border border-zinc-300 dark:border-slate-600 px-4 py-2 text-sm text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800"
          >
            {t("projects.cancel")}
          </button>
        )}
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!meetStart || saving}
          className="rounded bg-slate-700 dark:bg-slate-600 px-4 py-2 text-sm font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-60"
        >
          {saving ? "…" : todo.scheduledSlot?.meetingUrl ? t("meet.updateAction") : t("meet.createAction")}
        </button>
        {todo.scheduledSlot?.meetingUrl && (
          <>
            <button
              type="button"
              onClick={() => void handleClear()}
              disabled={saving}
              className="rounded border border-red-300 dark:border-red-700 px-4 py-2 text-sm text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-60"
            >
              {t("meet.cancelAction")}
            </button>
            <a
              href={todo.scheduledSlot.meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-emerald-300 dark:border-emerald-700 px-4 py-2 text-sm text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
              title={t(meetingJoinI18nKey(todo.scheduledSlot.meetingProvider))}
            >
              {t(meetingJoinI18nKey(todo.scheduledSlot.meetingProvider))}
            </a>
          </>
        )}
      </div>
    </div>
  );
}
