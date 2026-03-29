"use client";

import { useEffect, useState, type ReactNode } from "react";
import AppShell from "@/components/AppShell";
import {
  getMe,
  updateProfile,
  getWebhooks,
  saveWebhook,
  deleteWebhookApi,
  testWebhookApi,
  type WorkingHours,
  type WebhookConfig,
  type WebhookEvent,
  type WebhookPlatform,
} from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import type { Locale, TranslationKey } from "@/lib/i18n";

const DAY_KEYS: TranslationKey[] = [
  "settings.whMon",
  "settings.whTue",
  "settings.whWed",
  "settings.whThu",
  "settings.whFri",
  "settings.whSat",
  "settings.whSun",
];
const DAY_VALUES = [1, 2, 3, 4, 5, 6, 0];

type Section = "profile" | "languages" | "tasks" | "integrations" | "history" | "admin";

const SECTIONS: { key: Section; tKey: TranslationKey; icon: ReactNode }[] = [
  {
    key: "profile",
    tKey: "settings.profile",
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  {
    key: "languages",
    tKey: "settings.languages",
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
      </svg>
    ),
  },
  {
    key: "tasks",
    tKey: "settings.tasks",
    icon: (
      <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 3h14M5 21h14" />
        <path d="M7 3v4a5 5 0 005 5 5 5 0 005-5V3" />
        <path d="M7 21v-4a5 5 0 015-5 5 5 0 015 5v4" />
      </svg>
    ),
  },
  {
    key: "integrations",
    tKey: "settings.integrations" as TranslationKey,
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
  },
  {
    key: "history",
    tKey: "settings.history",
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: "admin",
    tKey: "settings.admin",
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
  },
];

export default function SettingsPage() {
  const { t, locale, setLocale: changeLocale } = useLocale();
  const [active, setActive] = useState<Section>("profile");

  return (
    <AppShell>
      <div className="max-w-[1000px] space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-slate-100">{t("settings.title")}</h2>
          <p className="text-sm text-zinc-500 dark:text-slate-400 mt-1">{t("settings.subtitle")}</p>
        </div>

        <div className="flex flex-col md:flex-row gap-4 md:gap-6">
          {/* ── Section nav ── */}
          <nav className="flex md:flex-col md:w-52 md:shrink-0 gap-1 overflow-x-auto pb-1 md:pb-0 md:overflow-x-visible">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                onClick={() => setActive(s.key)}
                className={`flex items-center gap-2 md:gap-3 px-3 py-2 md:py-2.5 rounded text-sm font-medium transition-colors text-left whitespace-nowrap shrink-0 md:shrink md:w-full ${
                  active === s.key
                    ? "bg-zinc-100 dark:bg-slate-800 text-zinc-900 dark:text-slate-100"
                    : "text-zinc-500 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800 hover:text-zinc-900 dark:hover:text-slate-100"
                }`}
              >
                {s.icon}
                {t(s.tKey)}
              </button>
            ))}
          </nav>

          {/* ── Content ── */}
          <div className="flex-1 min-w-0 bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-4 sm:p-6">
            {active === "profile" && <ProfileSection />}
            {active === "languages" && <LanguagesSection />}
            {active === "tasks" && <TasksSection />}
            {active === "integrations" && <IntegrationsSection />}
            {active === "history" && <HistorySection />}
            {active === "admin" && <AdminSection />}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function ProfileSection() {
  const { t } = useLocale();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await getMe();
        if (!cancelled) {
          setFirstName(me.firstName ?? "");
          setLastName(me.lastName ?? "");
          setEmail(me.email);
        }
      } catch { /* auth handled by AppShell */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await updateProfile({ firstName, lastName });
      setFirstName(updated.firstName);
      setLastName(updated.lastName);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert(err instanceof Error ? err.message : t("login.error"));
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400";

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-zinc-900 dark:text-slate-100">{t("settings.profile")}</h3>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("settings.firstName")}</label>
            <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder={t("settings.firstNamePlaceholder")} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("settings.lastName")}</label>
            <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder={t("settings.lastNamePlaceholder")} className={inputCls} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("settings.email")}</label>
          <input
            type="email"
            value={email}
            disabled
            className="w-full rounded border border-zinc-200 dark:border-slate-700 px-3 py-2 text-sm text-zinc-400 dark:text-slate-500 bg-zinc-50 dark:bg-slate-800/50 cursor-not-allowed"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("settings.password")}</label>
          <button type="button" className="rounded border border-zinc-300 dark:border-slate-600 px-4 py-2 text-sm text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors">
            {t("settings.changePassword")}
          </button>
        </div>
      </div>
      <div className="pt-4 border-t border-zinc-200 dark:border-slate-700 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded bg-slate-700 dark:bg-slate-100 px-5 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-300 disabled:opacity-60 transition-colors"
        >
          {saving ? t("settings.saving") : t("settings.save")}
        </button>
        {saved && <span className="text-xs text-green-600 dark:text-green-400">{t("settings.saved")}</span>}
      </div>
    </div>
  );
}

function LanguagesSection() {
  const { t, locale, setLocale: changeLocale } = useLocale();

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-zinc-900 dark:text-slate-100">{t("settings.languages")}</h3>
      <div>
        <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("settings.langLabel")}</label>
        <select
          value={locale}
          onChange={(e) => changeLocale(e.target.value as Locale)}
          className="w-full max-w-xs rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400"
        >
          <option value="fr">Français</option>
          <option value="en">English</option>
        </select>
      </div>
      <p className="text-xs text-zinc-400 dark:text-slate-500">{t("settings.langHint")}</p>
    </div>
  );
}

function TasksSection() {
  const { t } = useLocale();
  const [light, setLight] = useState(10);
  const [medium, setMedium] = useState(30);
  const [heavy, setHeavy] = useState(60);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const detectedTz = typeof Intl !== "undefined"
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : "UTC";

  const [wh, setWh] = useState<WorkingHours>({
    start: "09:00",
    end: "17:00",
    timezone: detectedTz,
    daysOfWeek: [1, 2, 3, 4, 5],
  });
  const [whSaving, setWhSaving] = useState(false);
  const [whSaved, setWhSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await getMe();
        if (cancelled) return;
        if (me.effortMinutes) {
          setLight(me.effortMinutes.light);
          setMedium(me.effortMinutes.medium);
          setHeavy(me.effortMinutes.heavy);
        }
        if (me.workingHours) {
          setWh(me.workingHours);
        }
      } catch { /* auth handled by AppShell */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await updateProfile({ effortMinutes: { light, medium, heavy } });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  const handleWhSave = async () => {
    setWhSaving(true);
    setWhSaved(false);
    try {
      await updateProfile({ workingHours: wh });
      setWhSaved(true);
      setTimeout(() => setWhSaved(false), 2000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
    } finally {
      setWhSaving(false);
    }
  };

  const toggleDay = (day: number) => {
    setWh((prev) => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(day)
        ? prev.daysOfWeek.filter((d) => d !== day)
        : [...prev.daysOfWeek, day].sort(),
    }));
  };

  const inputCls = "w-20 rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400 text-center";
  const timeInputCls = "rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400";

  const rows: { label: TranslationKey; value: number; set: (v: number) => void }[] = [
    { label: "settings.effortLight", value: light, set: setLight },
    { label: "settings.effortMedium", value: medium, set: setMedium },
    { label: "settings.effortHeavy", value: heavy, set: setHeavy },
  ];

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-zinc-900 dark:text-slate-100">{t("settings.effortDefaults")}</h3>
      <p className="text-sm text-zinc-500 dark:text-slate-400">{t("settings.effortDesc")}</p>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-3">
            <span className="text-sm text-zinc-700 dark:text-slate-300 w-36">{t(row.label)}</span>
            <input
              type="number"
              min={1}
              max={480}
              step={5}
              value={row.value}
              onChange={(e) => row.set(Math.max(1, Math.min(480, Number(e.target.value) || 1)))}
              className={inputCls}
            />
            <span className="text-sm text-zinc-400 dark:text-slate-500">{t("settings.minutes")}</span>
          </div>
        ))}
      </div>
      <div className="pt-4 border-t border-zinc-200 dark:border-slate-700 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded bg-slate-700 dark:bg-slate-100 px-5 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-300 disabled:opacity-60 transition-colors"
        >
          {saving ? t("settings.saving") : t("settings.save")}
        </button>
        {saved && <span className="text-xs text-green-600 dark:text-green-400">{t("settings.saved")}</span>}
      </div>

      {/* ── Working Hours ── */}
      <hr className="border-zinc-200 dark:border-slate-700" />
      <h3 className="text-lg font-semibold text-zinc-900 dark:text-slate-100">{t("settings.workingHours")}</h3>
      <p className="text-sm text-zinc-500 dark:text-slate-400">{t("settings.workingHoursDesc")}</p>

      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("settings.whStart")}</label>
            <input
              type="time"
              value={wh.start}
              onChange={(e) => setWh((prev) => ({ ...prev, start: e.target.value }))}
              className={timeInputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("settings.whEnd")}</label>
            <input
              type="time"
              value={wh.end}
              onChange={(e) => setWh((prev) => ({ ...prev, end: e.target.value }))}
              className={timeInputCls}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-2">{t("settings.whDays")}</label>
          <div className="flex gap-2">
            {DAY_KEYS.map((dayKey, i) => {
              const dayVal = DAY_VALUES[i];
              const active = wh.daysOfWeek.includes(dayVal);
              return (
                <button
                  key={dayVal}
                  type="button"
                  onClick={() => toggleDay(dayVal)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                    active
                      ? "bg-slate-700 text-white dark:bg-slate-100 dark:text-slate-900"
                      : "border border-zinc-300 dark:border-slate-600 text-zinc-500 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800"
                  }`}
                >
                  {t(dayKey)}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("settings.whTimezone")}</label>
          <span className="text-sm text-zinc-700 dark:text-slate-300">{wh.timezone}</span>
        </div>
      </div>

      <div className="pt-4 border-t border-zinc-200 dark:border-slate-700 flex items-center gap-3">
        <button
          type="button"
          onClick={handleWhSave}
          disabled={whSaving}
          className="rounded bg-slate-700 dark:bg-slate-100 px-5 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-300 disabled:opacity-60 transition-colors"
        >
          {whSaving ? t("settings.saving") : t("settings.save")}
        </button>
        {whSaved && <span className="text-xs text-green-600 dark:text-green-400">{t("settings.saved")}</span>}
      </div>
    </div>
  );
}

const ALL_EVENTS: { key: WebhookEvent; tKey: TranslationKey }[] = [
  { key: "task_assigned", tKey: "settings.eventTaskAssigned" as TranslationKey },
  { key: "task_completed", tKey: "settings.eventTaskCompleted" as TranslationKey },
  { key: "task_declined", tKey: "settings.eventTaskDeclined" as TranslationKey },
  { key: "task_accepted", tKey: "settings.eventTaskAccepted" as TranslationKey },
  { key: "team_invite", tKey: "settings.eventTeamInvite" as TranslationKey },
  { key: "deadline_approaching", tKey: "settings.eventDeadline" as TranslationKey },
];

const PLATFORMS: { key: WebhookPlatform; label: string }[] = [
  { key: "slack", label: "Slack" },
  { key: "discord", label: "Discord" },
  { key: "teams", label: "Microsoft Teams" },
  { key: "custom", label: "Custom (JSON)" },
];

function IntegrationsSection() {
  const { t } = useLocale();
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [editId, setEditId] = useState<string | undefined>(undefined);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [platform, setPlatform] = useState<WebhookPlatform>("slack");
  const [events, setEvents] = useState<WebhookEvent[]>(["task_assigned", "task_completed"]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await getWebhooks();
        if (!cancelled) setWebhooks(list);
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const resetForm = () => {
    setEditId(undefined);
    setLabel("");
    setUrl("");
    setPlatform("slack");
    setEvents(["task_assigned", "task_completed"]);
    setShowForm(false);
  };

  const openEdit = (wh: WebhookConfig) => {
    setEditId(wh.id);
    setLabel(wh.label);
    setUrl(wh.url);
    setPlatform(wh.platform);
    setEvents([...wh.events]);
    setShowForm(true);
  };

  const toggleEvent = (ev: WebhookEvent) => {
    setEvents((prev) =>
      prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]
    );
  };

  const handleSave = async () => {
    if (!url.trim()) return;
    setSaving(true);
    try {
      const saved = await saveWebhook({
        id: editId,
        label: label.trim() || "Webhook",
        url: url.trim(),
        platform,
        events,
        enabled: true,
      });
      if (editId) {
        setWebhooks((prev) => prev.map((w) => w.id === editId ? saved : w));
      } else {
        setWebhooks((prev) => [...prev, saved]);
      }
      resetForm();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteWebhookApi(id);
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
    } catch { /* ignore */ }
  };

  const handleToggle = async (wh: WebhookConfig) => {
    try {
      const updated = await saveWebhook({ ...wh, enabled: !wh.enabled });
      setWebhooks((prev) => prev.map((w) => w.id === wh.id ? updated : w));
    } catch { /* ignore */ }
  };

  const handleTest = async (wh: WebhookConfig) => {
    setTesting(wh.id);
    setTestResult(null);
    const ok = await testWebhookApi(wh.url, wh.platform);
    setTestResult({ id: wh.id, ok });
    setTesting(null);
    setTimeout(() => setTestResult(null), 4000);
  };

  const inputCls = "w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400";

  const platformIcon = (p: WebhookPlatform) => {
    switch (p) {
      case "slack": return "💬";
      case "discord": return "🎮";
      case "teams": return "💼";
      default: return "🔗";
    }
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-zinc-900 dark:text-slate-100">{t("settings.integrationsTitle" as TranslationKey)}</h3>
      <p className="text-sm text-zinc-500 dark:text-slate-400">{t("settings.integrationsDesc" as TranslationKey)}</p>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Existing webhooks */}
          {webhooks.length === 0 && !showForm && (
            <p className="text-sm text-zinc-400 dark:text-slate-500 italic py-4">{t("settings.webhookNone" as TranslationKey)}</p>
          )}

          {webhooks.length > 0 && (
            <div className="space-y-3">
              {webhooks.map((wh) => (
                <div key={wh.id} className="group rounded-md border border-zinc-200 dark:border-slate-700 p-4">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{platformIcon(wh.platform)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-900 dark:text-slate-100 truncate">{wh.label}</p>
                      <p className="text-[10px] text-zinc-400 dark:text-slate-500 truncate">{wh.url}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggle(wh)}
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded transition-colors ${
                        wh.enabled
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                          : "bg-zinc-100 text-zinc-400 dark:bg-slate-800 dark:text-slate-500"
                      }`}
                    >
                      {wh.enabled ? t("settings.webhookEnabled" as TranslationKey) : t("settings.webhookDisabled" as TranslationKey)}
                    </button>
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => handleTest(wh)}
                        disabled={testing === wh.id}
                        className="rounded px-2.5 py-1 text-[11px] font-medium border border-zinc-300 dark:border-slate-600 text-zinc-600 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                      >
                        {testing === wh.id ? "…" : t("settings.webhookTest" as TranslationKey)}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(wh)}
                        className="rounded p-1.5 text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-zinc-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(wh.id)}
                        className="rounded p-1.5 text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-zinc-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {wh.events.map((ev) => {
                      const evMeta = ALL_EVENTS.find((e) => e.key === ev);
                      return (
                        <span key={ev} className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-slate-800 text-zinc-500 dark:text-slate-400">
                          {evMeta ? t(evMeta.tKey) : ev}
                        </span>
                      );
                    })}
                  </div>
                  {testResult?.id === wh.id && (
                    <p className={`text-xs mt-2 font-medium ${testResult.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                      {testResult.ok ? t("settings.webhookTestOk" as TranslationKey) : t("settings.webhookTestFail" as TranslationKey)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add / Edit form */}
          {showForm ? (
            <div className="rounded-md border border-zinc-200 dark:border-slate-700 p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("settings.webhookLabel" as TranslationKey)}</label>
                  <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("settings.webhookLabelPlaceholder" as TranslationKey)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("settings.webhookPlatform" as TranslationKey)}</label>
                  <select
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value as WebhookPlatform)}
                    className={inputCls}
                  >
                    {PLATFORMS.map((p) => (
                      <option key={p.key} value={p.key}>{p.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("settings.webhookUrl" as TranslationKey)}</label>
                <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t("settings.webhookUrlPlaceholder" as TranslationKey)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-2">{t("settings.webhookEvents" as TranslationKey)}</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_EVENTS.map((ev) => {
                    const active = events.includes(ev.key);
                    return (
                      <button
                        key={ev.key}
                        type="button"
                        onClick={() => toggleEvent(ev.key)}
                        className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                          active
                            ? "bg-slate-700 text-white dark:bg-slate-100 dark:text-slate-900"
                            : "border border-zinc-300 dark:border-slate-600 text-zinc-500 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800"
                        }`}
                      >
                        {t(ev.tKey)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !url.trim()}
                  className="rounded bg-slate-700 dark:bg-slate-100 px-5 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-300 disabled:opacity-60 transition-colors"
                >
                  {saving ? t("settings.saving") : t("settings.save")}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded border border-zinc-200 dark:border-slate-600 px-4 py-2 text-sm font-medium text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
                >
                  {t("teams.cancel")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { resetForm(); setShowForm(true); }}
              className="inline-flex items-center gap-2 rounded-md border border-dashed border-zinc-300 dark:border-slate-600 px-4 py-2.5 text-sm font-medium text-zinc-600 dark:text-slate-400 hover:bg-zinc-50 dark:hover:bg-slate-800 hover:border-zinc-400 dark:hover:border-slate-500 transition-colors w-full justify-center"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              {t("settings.webhookAdd" as TranslationKey)}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function HistorySection() {
  const { t } = useLocale();

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-zinc-900 dark:text-slate-100">{t("settings.historyTitle")}</h3>
      <p className="text-sm text-zinc-500 dark:text-slate-400">
        {t("settings.historyDesc")}
      </p>
      <div className="border border-zinc-200 dark:border-slate-700 rounded-md divide-y divide-zinc-200 dark:divide-slate-700">
        <div className="px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-zinc-600 dark:text-slate-300">{t("settings.noActivity")}</span>
          <span className="text-xs text-zinc-400 dark:text-slate-500">—</span>
        </div>
      </div>
    </div>
  );
}

function AdminSection() {
  const { t } = useLocale();

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-zinc-900 dark:text-slate-100">{t("settings.adminTitle")}</h3>
      <p className="text-sm text-zinc-500 dark:text-slate-400">
        {t("settings.adminDesc")}
      </p>
      <div className="space-y-4">
        <div className="bg-zinc-50 dark:bg-slate-800/50 rounded-md border border-zinc-200 dark:border-slate-700 p-4">
          <h4 className="text-sm font-medium text-zinc-900 dark:text-slate-100 mb-1">{t("settings.userManagement")}</h4>
          <p className="text-xs text-zinc-500 dark:text-slate-400">{t("settings.userManagementDesc")}</p>
        </div>
        <div className="bg-zinc-50 dark:bg-slate-800/50 rounded-md border border-zinc-200 dark:border-slate-700 p-4">
          <h4 className="text-sm font-medium text-zinc-900 dark:text-slate-100 mb-1">{t("settings.dataExport")}</h4>
          <p className="text-xs text-zinc-500 dark:text-slate-400">{t("settings.dataExportDesc")}</p>
        </div>
        <div className="bg-red-50 dark:bg-red-950/30 rounded-md border border-red-200 dark:border-red-800 p-4">
          <h4 className="text-sm font-medium text-red-700 dark:text-red-400 mb-1">{t("settings.dangerZone")}</h4>
          <p className="text-xs text-red-600/70 dark:text-red-400/70 mb-3">{t("settings.dangerDesc")}</p>
          <button type="button" className="rounded border border-red-300 dark:border-red-700 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors">
            {t("settings.deleteAccount")}
          </button>
        </div>
      </div>
    </div>
  );
}
