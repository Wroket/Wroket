"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import PageHelpButton from "@/components/PageHelpButton";
import {
  getMe,
  updateProfile,
  changePassword as changePasswordApi,
  getMyExport,
  deleteMyAccount,
  getMyActivity,
  getWebhooks,
  saveWebhook,
  deleteWebhookApi,
  testWebhookApi,
  getOwnedTeams,
  transferTeamOwnership,
  totpSetup,
  totpEnable,
  totpDisable,
  totpCancelSetup,
  requestEmail2faEnrollment,
  confirmEmail2faEnrollment,
  putTotpEmailFallback,
  requestEmail2faDisableOtp,
  disableEmailOtp2fa,
  type WorkingHours,
  type WebhookConfig,
  type WebhookEvent,
  type WebhookPlatform,
  type ActivityLogEntry,
  type Team,
  type NotificationDeliveryMode,
  type NotificationOutboundFrequency,
} from "@/lib/api";
import type { NotificationType } from "@/lib/api/teams";
import { useLocale } from "@/lib/LocaleContext";
import type { Locale, TranslationKey } from "@/lib/i18n";
import { useToast } from "@/components/Toast";

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

/** Auth/session errors that should show a calm notice + link, not a red “hard error”. */
function isSessionLikeAuthError(raw: string): boolean {
  const m = raw.trim();
  return (
    m === "Non authentifié"
    || m.toLowerCase().includes("non authentifié")
    || m === "Unauthorized"
    || /^401\b/.test(m)
  );
}

type Section = "profile" | "security" | "languages" | "tasks" | "integrations" | "history" | "admin";

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
    key: "security",
    tKey: "settings.security",
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
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
    tKey: "settings.integrations",
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
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const { t } = useLocale();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [active, setActive] = useState<Section>(
    SECTIONS.some((s) => s.key === tabParam) ? (tabParam as Section) : "profile",
  );

  return (
    <AppShell>
      <div className="max-w-[1000px] mx-auto space-y-6">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-slate-100">{t("settings.title")}</h2>
            <PageHelpButton
              title={t("settings.title")}
              items={[
                { text: t("help.settings.lang") },
                { text: t("help.settings.hours") },
                { text: t("help.settings.security") },
                { text: t("help.settings.integrations") },
                { text: t("help.settings.google") },
                { text: t("help.settings.teams") },
                { text: t("help.settings.activity") },
              ]}
            />
          </div>
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
          <div className="flex-1 min-w-0 bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-4 sm:p-6 overflow-y-auto max-h-[calc(100vh-8rem)]">
            {active === "profile" && <ProfileSection />}
            {active === "security" && <SecuritySection />}
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
  const { toast } = useToast();
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
      toast.error(err instanceof Error ? err.message : t("login.error"));
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
        <ChangePasswordForm />
      </div>
      <div className="pt-4 border-t border-zinc-200 dark:border-slate-700 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded bg-slate-700 dark:bg-slate-600 px-5 py-2 text-sm font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-60 transition-colors"
        >
          {saving ? t("settings.saving") : t("settings.save")}
        </button>
        {saved && <span className="text-xs text-green-600 dark:text-green-400">{t("settings.saved")}</span>}
      </div>
    </div>
  );
}

function SecuritySection() {
  const { t } = useLocale();
  const [totpQrDataUrl, setTotpQrDataUrl] = useState("");
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [disableNeedsPassword, setDisableNeedsPassword] = useState(true);
  const [loadingMe, setLoadingMe] = useState(true);
  const [pairing, setPairing] = useState<{ otpauthUrl: string; secret: string } | null>(null);
  const [enableCode, setEnableCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [disableSuccess, setDisableSuccess] = useState(false);
  const [disableSuccessKind, setDisableSuccessKind] = useState<"totp" | "email" | null>(null);
  const [enableSuccessModalOpen, setEnableSuccessModalOpen] = useState(false);
  const [enableSuccessWasEmail, setEnableSuccessWasEmail] = useState(false);
  const [emailOtp2faEnabled, setEmailOtp2faEnabled] = useState(false);
  const [totpEmailFallback, setTotpEmailFallback] = useState(true);
  const [emailEnrolling, setEmailEnrolling] = useState(false);
  const [emailEnrollCode, setEmailEnrollCode] = useState("");
  const [emailDisablePassword, setEmailDisablePassword] = useState("");
  const [emailDisableCode, setEmailDisableCode] = useState("");

  const inputCls =
    "w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400";

  const refreshMe = async () => {
    const me = await getMe();
    setTwoFactorEnabled(!!me.twoFactorEnabled);
    setDisableNeedsPassword(me.twoFactorDisableRequiresPassword !== false);
    setEmailOtp2faEnabled(!!me.emailOtp2faEnabled);
    setTotpEmailFallback(me.totpEmailFallbackEnabled !== false);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await getMe();
        if (!cancelled) {
          setTwoFactorEnabled(!!me.twoFactorEnabled);
          setDisableNeedsPassword(me.twoFactorDisableRequiresPassword !== false);
          setEmailOtp2faEnabled(!!me.emailOtp2faEnabled);
          setTotpEmailFallback(me.totpEmailFallbackEnabled !== false);
        }
      } catch { /* auth handled by AppShell */ }
      finally {
        if (!cancelled) setLoadingMe(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!pairing?.otpauthUrl) {
      setTotpQrDataUrl("");
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(pairing.otpauthUrl, { width: 200, margin: 1, errorCorrectionLevel: "M" })
      .then((url) => {
        if (!cancelled) setTotpQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setTotpQrDataUrl("");
      });
    return () => { cancelled = true; };
  }, [pairing?.otpauthUrl]);

  const startEmailEnroll = async () => {
    setError(null);
    setDisableSuccess(false);
    setBusy(true);
    try {
      await requestEmail2faEnrollment();
      setEmailEnrolling(true);
      setEmailEnrollCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("login.error"));
    } finally {
      setBusy(false);
    }
  };

  const confirmEmailEnroll = async () => {
    setError(null);
    setBusy(true);
    try {
      await confirmEmail2faEnrollment(emailEnrollCode);
      setEmailEnrolling(false);
      setEmailEnrollCode("");
      await refreshMe();
      setEnableSuccessWasEmail(true);
      setEnableSuccessModalOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("login.error"));
    } finally {
      setBusy(false);
    }
  };

  const cancelEmailEnroll = () => {
    setEmailEnrolling(false);
    setEmailEnrollCode("");
    setError(null);
  };

  const toggleTotpFallback = async (enabled: boolean) => {
    setError(null);
    try {
      await putTotpEmailFallback(enabled);
      setTotpEmailFallback(enabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("login.error"));
    }
  };

  const sendEmailDisableCode = async () => {
    setError(null);
    setBusy(true);
    try {
      await requestEmail2faDisableOtp();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("login.error"));
    } finally {
      setBusy(false);
    }
  };

  const disableEmail2fa = async () => {
    setError(null);
    setBusy(true);
    try {
      await disableEmailOtp2fa({
        code: emailDisableCode,
        password: disableNeedsPassword ? emailDisablePassword : undefined,
      });
      setEmailDisablePassword("");
      setEmailDisableCode("");
      await refreshMe();
      setDisableSuccessKind("email");
      setDisableSuccess(true);
      setTimeout(() => setDisableSuccess(false), 8000);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("login.error"));
    } finally {
      setBusy(false);
    }
  };

  const startPairing = async () => {
    setError(null);
    setDisableSuccess(false);
    setBusy(true);
    try {
      const r = await totpSetup();
      setPairing(r);
      setEnableCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("login.error"));
    } finally {
      setBusy(false);
    }
  };

  const confirmEnable = async () => {
    setError(null);
    setBusy(true);
    try {
      await totpEnable(enableCode);
      setPairing(null);
      setEnableCode("");
      try {
        await refreshMe();
      } catch (re) {
        setTwoFactorEnabled(true);
        setError(re instanceof Error ? re.message : "Non authentifié");
        return;
      }
      setError(null);
      setEnableSuccessWasEmail(false);
      setEnableSuccessModalOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("login.error"));
    } finally {
      setBusy(false);
    }
  };

  const cancelPairing = async () => {
    setError(null);
    setBusy(true);
    try {
      await totpCancelSetup();
      setPairing(null);
    } catch {
      setPairing(null);
    } finally {
      setBusy(false);
    }
  };

  const disable2fa = async () => {
    setError(null);
    setBusy(true);
    try {
      await totpDisable({
        code: disableCode,
        password: disableNeedsPassword ? disablePassword : undefined,
      });
      setDisablePassword("");
      setDisableCode("");
      setError(null);
      await refreshMe();
      setDisableSuccessKind("totp");
      setDisableSuccess(true);
      setTimeout(() => setDisableSuccess(false), 8000);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("login.error"));
    } finally {
      setBusy(false);
    }
  };

  if (loadingMe) {
    return (
      <div className="space-y-6">
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-slate-100">{t("settings.security")}</h3>
        <p className="text-sm text-zinc-500 dark:text-slate-400">{t("settings.securityLoading")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-slate-100">{t("settings.security2fa")}</h3>
        <p className="text-sm text-zinc-500 dark:text-slate-400 mt-1">{t("settings.security2faDesc")}</p>
      </div>

      {disableSuccess && !twoFactorEnabled && (
        <p
          role="status"
          className="text-sm text-green-800 dark:text-green-300 bg-green-50 dark:bg-green-950/35 border border-green-200 dark:border-green-800 rounded-md px-3 py-2"
        >
          {disableSuccessKind === "email"
            ? t("settings.security2faDisabledSuccessEmail")
            : t("settings.security2faDisabledSuccess")}
        </p>
      )}

      {error && isSessionLikeAuthError(error) && (
        <div
          role="status"
          className="rounded-xl border border-amber-200/90 dark:border-amber-700/50 bg-gradient-to-br from-amber-50 to-orange-50/80 dark:from-amber-950/40 dark:to-slate-900/60 px-4 py-3 flex gap-3 shadow-sm"
        >
          <div className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" aria-hidden>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
              {t("settings.security2faSessionNoticeTitle")}
            </p>
            <p className="text-sm text-amber-900/85 dark:text-amber-100/85 leading-relaxed">
              {t("settings.security2faSessionNoticeBody")}
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-800 dark:text-amber-300 hover:text-amber-950 dark:hover:text-amber-200 underline underline-offset-2 decoration-amber-700/40 hover:decoration-amber-900 dark:decoration-amber-500/50"
            >
              {t("settings.security2faSessionNoticeCta")}
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        </div>
      )}

      {error && !isSessionLikeAuthError(error) && (
        <p
          role="alert"
          className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md px-3 py-2"
        >
          {error}
        </p>
      )}

      {!twoFactorEnabled && !pairing && !emailEnrolling && (
        <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
          <button
            type="button"
            disabled={busy}
            onClick={startPairing}
            className="rounded bg-slate-700 dark:bg-slate-600 px-5 py-2 text-sm font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-60 transition-colors"
          >
            {busy ? "…" : t("settings.security2faEnableApp")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={startEmailEnroll}
            className="rounded border border-zinc-300 dark:border-slate-600 px-5 py-2 text-sm font-medium text-zinc-800 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-800 disabled:opacity-60 transition-colors"
          >
            {busy ? "…" : t("settings.security2faEnableEmail")}
          </button>
        </div>
      )}

      {emailEnrolling && (
        <div className="space-y-4 rounded border border-zinc-200 dark:border-slate-700 p-4">
          <p className="text-sm text-zinc-700 dark:text-slate-300">{t("settings.security2faEmailEnrollHint")}</p>
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("settings.security2faCode")}</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={emailEnrollCode}
              onChange={(e) => setEmailEnrollCode(e.target.value.replace(/\D/g, ""))}
              className={inputCls}
              maxLength={12}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={confirmEmailEnroll}
              className="rounded bg-emerald-600 dark:bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 dark:hover:bg-emerald-400 disabled:opacity-60"
            >
              {busy ? "…" : t("settings.security2faEmailEnrollConfirm")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={cancelEmailEnroll}
              className="rounded border border-zinc-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 disabled:opacity-60"
            >
              {t("settings.security2faCancel")}
            </button>
          </div>
        </div>
      )}

      {pairing && (
        <div className="space-y-4 rounded border border-zinc-200 dark:border-slate-700 p-4">
          <p className="text-sm text-zinc-700 dark:text-slate-300">{t("settings.security2faScan")}</p>
          <div className="flex justify-center">
            {totpQrDataUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={totpQrDataUrl} alt="" className="rounded border border-zinc-200 dark:border-slate-600 bg-white p-2" width={200} height={200} />
            ) : (
              <div className="w-[200px] h-[200px] rounded border border-zinc-200 dark:border-slate-600 bg-zinc-50 dark:bg-slate-800/50 animate-pulse" aria-hidden />
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("settings.security2faSecret")}</label>
            <code className="block text-xs break-all rounded border border-zinc-200 dark:border-slate-700 bg-zinc-50 dark:bg-slate-800/80 px-2 py-2 font-mono text-zinc-800 dark:text-slate-200">
              {pairing.secret}
            </code>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("settings.security2faConfirm")}</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={enableCode}
              onChange={(e) => setEnableCode(e.target.value.replace(/\D/g, ""))}
              className={inputCls}
              maxLength={12}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={confirmEnable}
              className="rounded bg-emerald-600 dark:bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 dark:hover:bg-emerald-400 disabled:opacity-60"
            >
              {busy ? "…" : t("settings.security2faEnable")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={cancelPairing}
              className="rounded border border-zinc-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 disabled:opacity-60"
            >
              {t("settings.security2faCancel")}
            </button>
          </div>
        </div>
      )}

      {twoFactorEnabled && emailOtp2faEnabled && (
        <div className="space-y-4 rounded border border-zinc-200 dark:border-slate-700 p-4">
          <p className="text-sm text-zinc-700 dark:text-slate-300">{t("settings.security2faDisableEmailTitle")}</p>
          <button
            type="button"
            disabled={busy}
            onClick={sendEmailDisableCode}
            className="rounded border border-zinc-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 disabled:opacity-60"
          >
            {busy ? "…" : t("settings.security2faRequestDisableEmail")}
          </button>
          {!disableNeedsPassword && (
            <p className="text-xs text-zinc-500 dark:text-slate-400">{t("settings.security2faSsoDisableHint")}</p>
          )}
          {disableNeedsPassword && (
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("settings.security2faPassword")}</label>
              <input
                type="password"
                autoComplete="current-password"
                value={emailDisablePassword}
                onChange={(e) => setEmailDisablePassword(e.target.value)}
                className={inputCls}
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("settings.security2faCode")}</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={emailDisableCode}
              onChange={(e) => setEmailDisableCode(e.target.value.replace(/\D/g, ""))}
              className={inputCls}
              maxLength={12}
            />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={disableEmail2fa}
            className="rounded bg-red-600 dark:bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 dark:hover:bg-red-400 disabled:opacity-60"
          >
            {busy ? "…" : t("settings.security2faDisableEmailCta")}
          </button>
        </div>
      )}

      {twoFactorEnabled && !emailOtp2faEnabled && (
        <>
          <div className="rounded border border-zinc-200 dark:border-slate-700 p-4 flex items-start gap-3">
            <input
              id="totp-fallback"
              type="checkbox"
              className="mt-1 rounded border-zinc-300 dark:border-slate-600"
              checked={totpEmailFallback}
              onChange={(e) => void toggleTotpFallback(e.target.checked)}
            />
            <label htmlFor="totp-fallback" className="text-sm text-zinc-700 dark:text-slate-300 cursor-pointer">
              {t("settings.security2faTotpFallback")}
            </label>
          </div>
          <div className="space-y-4 rounded border border-zinc-200 dark:border-slate-700 p-4">
            <p className="text-sm text-zinc-700 dark:text-slate-300">{t("settings.security2faDisable")}</p>
            {!disableNeedsPassword && (
              <p className="text-xs text-zinc-500 dark:text-slate-400">{t("settings.security2faSsoDisableHint")}</p>
            )}
            {disableNeedsPassword && (
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("settings.security2faPassword")}</label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  className={inputCls}
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("settings.security2faCode")}</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ""))}
                className={inputCls}
                maxLength={12}
              />
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={disable2fa}
              className="rounded bg-red-600 dark:bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 dark:hover:bg-red-400 disabled:opacity-60"
            >
              {busy ? "…" : t("settings.security2faDisable")}
            </button>
          </div>
        </>
      )}

      {enableSuccessModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-default border-0 p-0"
            aria-label={t("a11y.close")}
            onClick={() => setEnableSuccessModalOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="security-2fa-enabled-title"
            className="relative bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-zinc-200 dark:border-slate-700 max-w-md w-full p-6"
          >
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-11 h-11 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                <svg className="w-6 h-6 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div className="min-w-0">
                <h2 id="security-2fa-enabled-title" className="text-lg font-semibold text-zinc-900 dark:text-slate-100">
                  {t(enableSuccessWasEmail ? "settings.security2faEnabledModalTitleEmail" : "settings.security2faEnabledModalTitle")}
                </h2>
                <p className="mt-2 text-sm text-zinc-600 dark:text-slate-400">
                  {t(enableSuccessWasEmail ? "settings.security2faEnabledModalBodyEmail" : "settings.security2faEnabledModalBody")}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setEnableSuccessModalOpen(false)}
              className="mt-6 w-full rounded-lg bg-emerald-600 dark:bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 dark:hover:bg-emerald-400 transition-colors"
            >
              {t("settings.security2faEnabledModalOk")}
            </button>
          </div>
        </div>
      )}
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
  const { toast } = useToast();
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
  const [tzMismatch, setTzMismatch] = useState(false);
  const [skipNonWorkingDays, setSkipNonWorkingDays] = useState(false);
  const [archiveRetentionDays, setArchiveRetentionDays] = useState(30);
  const [arSaving, setArSaving] = useState(false);
  const [arSaved, setArSaved] = useState(false);

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
          if (me.workingHours.timezone !== detectedTz) {
            setTzMismatch(true);
          }
        }
        setSkipNonWorkingDays(!!me.skipNonWorkingDays);
        const ar = me.archivedTaskRetentionDays;
        if (typeof ar === "number" && (ar === 0 || (ar >= 1 && ar <= 365))) {
          setArchiveRetentionDays(ar);
        } else {
          setArchiveRetentionDays(30);
        }
      } catch { /* auth handled by AppShell */ }
    })();
    return () => { cancelled = true; };
  }, [detectedTz]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await updateProfile({ effortMinutes: { light, medium, heavy } });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toast.genericError"));
    } finally {
      setSaving(false);
    }
  };

  const handleWhSave = async () => {
    setWhSaving(true);
    setWhSaved(false);
    try {
      await updateProfile({ workingHours: wh, skipNonWorkingDays });
      setWhSaved(true);
      setTimeout(() => setWhSaved(false), 2000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toast.genericError"));
    } finally {
      setWhSaving(false);
    }
  };

  const handleArchiveRetentionSave = async () => {
    setArSaving(true);
    setArSaved(false);
    try {
      await updateProfile({ archivedTaskRetentionDays: archiveRetentionDays });
      setArSaved(true);
      setTimeout(() => setArSaved(false), 2000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toast.genericError"));
    } finally {
      setArSaving(false);
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
          className="rounded bg-slate-700 dark:bg-slate-600 px-5 py-2 text-sm font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-60 transition-colors"
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
                      ? "bg-slate-700 text-white dark:bg-slate-600 dark:text-slate-100 shadow-sm hover:bg-slate-800 dark:hover:bg-slate-500"
                      : "border border-zinc-300 dark:border-slate-600 text-zinc-500 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800 bg-white dark:bg-slate-900"
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
          <select
            value={wh.timezone}
            onChange={(e) => { setWh({ ...wh, timezone: e.target.value }); setTzMismatch(false); }}
            className="mt-1 block w-full rounded-lg border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 shadow-sm focus:border-emerald-500 dark:focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:focus:ring-emerald-400"
          >
            {[
              "Europe/Paris", "Europe/London", "Europe/Berlin", "Europe/Madrid", "Europe/Rome",
              "Europe/Brussels", "Europe/Amsterdam", "Europe/Zurich", "Europe/Vienna",
              "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
              "America/Toronto", "America/Sao_Paulo", "America/Mexico_City",
              "Asia/Tokyo", "Asia/Shanghai", "Asia/Singapore", "Asia/Dubai", "Asia/Kolkata",
              "Australia/Sydney", "Pacific/Auckland", "Africa/Casablanca", "UTC",
            ].map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </select>
          {tzMismatch && (
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              <span>⚠️</span>
              <span>{t("settings.tzMismatch").replace("{tz}", detectedTz)}</span>
              <button
                type="button"
                onClick={() => { setWh({ ...wh, timezone: detectedTz }); setTzMismatch(false); }}
                className="ml-auto text-xs font-semibold text-amber-800 dark:text-amber-200 underline hover:no-underline"
              >
                {t("settings.tzApply")}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="pt-4 border-t border-zinc-200 dark:border-slate-700 flex items-center gap-3">
        <button
          type="button"
          onClick={handleWhSave}
          disabled={whSaving}
          className="rounded bg-slate-700 dark:bg-slate-600 px-5 py-2 text-sm font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-60 transition-colors"
        >
          {whSaving ? t("settings.saving") : t("settings.save")}
        </button>
        {whSaved && <span className="text-xs text-green-600 dark:text-green-400">{t("settings.saved")}</span>}
      </div>

      {/* ── Recurrence on working days ── */}
      <hr className="border-zinc-200 dark:border-slate-700" />
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-slate-100">{t("settings.skipNonWorkingDays")}</h3>
          <p className="text-xs text-zinc-400 dark:text-slate-500 mt-0.5">{t("settings.skipNonWorkingDaysDesc")}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={skipNonWorkingDays}
          onClick={async () => {
            const next = !skipNonWorkingDays;
            setSkipNonWorkingDays(next);
            try {
              await updateProfile({ skipNonWorkingDays: next });
            } catch {
              setSkipNonWorkingDays(!next);
            }
          }}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${skipNonWorkingDays ? "bg-emerald-600 dark:bg-emerald-700" : "bg-zinc-300 dark:bg-slate-600"}`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition duration-200 ${skipNonWorkingDays ? "translate-x-5" : "translate-x-0"}`}
          />
        </button>
      </div>

      {/* ── Archived tasks retention ── */}
      <hr className="border-zinc-200 dark:border-slate-700" />
      <h3 className="text-lg font-semibold text-zinc-900 dark:text-slate-100">{t("settings.archiveRetentionTitle")}</h3>
      <p className="text-sm text-zinc-500 dark:text-slate-400">{t("settings.archiveRetentionDesc")}</p>
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("settings.archiveRetentionLabel")}</label>
          <input
            type="number"
            min={0}
            max={365}
            step={1}
            value={archiveRetentionDays}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (e.target.value === "") {
                setArchiveRetentionDays(0);
                return;
              }
              if (Number.isNaN(v)) return;
              setArchiveRetentionDays(Math.max(0, Math.min(365, Math.floor(v))));
            }}
            className="w-24 rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400 text-center"
          />
          <p className="text-xs text-zinc-400 dark:text-slate-500 mt-1">{t("settings.archiveRetentionHint")}</p>
        </div>
        <div className="flex items-center gap-3 pt-2 sm:pt-0">
          <button
            type="button"
            onClick={handleArchiveRetentionSave}
            disabled={arSaving}
            className="rounded bg-slate-700 dark:bg-slate-600 px-5 py-2 text-sm font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-60 transition-colors"
          >
            {arSaving ? t("settings.saving") : t("settings.save")}
          </button>
          {arSaved && <span className="text-xs text-green-600 dark:text-green-400">{t("settings.saved")}</span>}
        </div>
      </div>
    </div>
  );
}

const ALL_EVENTS: { key: WebhookEvent; tKey: TranslationKey }[] = [
  { key: "task_assigned", tKey: "settings.eventTaskAssigned" },
  { key: "task_completed", tKey: "settings.eventTaskCompleted" },
  { key: "task_cancelled", tKey: "settings.eventTaskCancelled" },
  { key: "task_declined", tKey: "settings.eventTaskDeclined" },
  { key: "task_accepted", tKey: "settings.eventTaskAccepted" },
  { key: "team_invite", tKey: "settings.eventTeamInvite" },
  { key: "deadline_approaching", tKey: "settings.eventDeadline" },
  { key: "deadline_today", tKey: "settings.eventDeadlineToday" },
  { key: "comment_mention", tKey: "settings.eventCommentMention" },
  { key: "project_deleted", tKey: "settings.eventProjectDeleted" },
];

const PLATFORMS: { key: WebhookPlatform; label: string }[] = [
  { key: "slack", label: "Slack" },
  { key: "discord", label: "Discord" },
  { key: "teams", label: "Microsoft Teams" },
  { key: "google_chat", label: "Google Chat" },
  { key: "custom", label: "Custom (JSON)" },
];

function IntegrationsSection() {
  const { t } = useLocale();
  const { toast } = useToast();
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [deliveryMode, setDeliveryMode] = useState<NotificationDeliveryMode>("none");
  const [deliveryUrl, setDeliveryUrl] = useState("");
  const [savingDelivery, setSavingDelivery] = useState(false);
  const [deliverySaved, setDeliverySaved] = useState(false);

  const [disabledInApp, setDisabledInApp] = useState<NotificationType[]>([]);
  const [disabledOutbound, setDisabledOutbound] = useState<NotificationType[]>([]);
  const [savingTypes, setSavingTypes] = useState(false);
  const [typesSaved, setTypesSaved] = useState(false);

  const [outboundFrequency, setOutboundFrequency] = useState<NotificationOutboundFrequency>("immediate");
  const [digestHour, setDigestHour] = useState(8);
  const [savingFreq, setSavingFreq] = useState(false);
  const [freqSaved, setFreqSaved] = useState(false);

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
        const [list, me] = await Promise.all([getWebhooks(), getMe()]);
        if (!cancelled) {
          setWebhooks(list);
          setDeliveryMode(me.notificationDeliveryMode ?? "none");
          setDeliveryUrl(me.notificationDeliveryWebhookUrl ?? "");
          setDisabledInApp((me.notificationTypesDisabledInApp ?? []) as NotificationType[]);
          setDisabledOutbound((me.notificationTypesDisabledOutbound ?? []) as NotificationType[]);
          setOutboundFrequency(me.notificationOutboundFrequency ?? "immediate");
          setDigestHour(me.notificationDigestHour ?? 8);
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSaveDelivery = async () => {
    setSavingDelivery(true);
    setDeliverySaved(false);
    try {
      await updateProfile({
        notificationDeliveryMode: deliveryMode,
        notificationDeliveryWebhookUrl:
          deliveryMode === "slack" || deliveryMode === "teams" || deliveryMode === "google_chat"
            ? deliveryUrl.trim()
            : null,
      });
      setDeliverySaved(true);
      setTimeout(() => setDeliverySaved(false), 4000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.genericError"));
    } finally {
      setSavingDelivery(false);
    }
  };

  const handleSaveTypes = async () => {
    setSavingTypes(true);
    setTypesSaved(false);
    try {
      await updateProfile({
        notificationTypesDisabledInApp: disabledInApp,
        notificationTypesDisabledOutbound: disabledOutbound,
      });
      setTypesSaved(true);
      setTimeout(() => setTypesSaved(false), 4000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.genericError"));
    } finally {
      setSavingTypes(false);
    }
  };

  const handleSaveFrequency = async () => {
    setSavingFreq(true);
    setFreqSaved(false);
    try {
      await updateProfile({
        notificationOutboundFrequency: outboundFrequency,
        notificationDigestHour: digestHour,
      });
      setFreqSaved(true);
      setTimeout(() => setFreqSaved(false), 4000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.genericError"));
    } finally {
      setSavingFreq(false);
    }
  };

  const toggleInApp = (type: NotificationType) => {
    setDisabledInApp((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const toggleOutbound = (type: NotificationType) => {
    setDisabledOutbound((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

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
      toast.error(err instanceof Error ? err.message : t("toast.genericError"));
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
    try {
      const ok = await testWebhookApi(wh.url, wh.platform);
      setTestResult({ id: wh.id, ok });
    } catch {
      setTestResult({ id: wh.id, ok: false });
    } finally {
      setTesting(null);
      setTimeout(() => setTestResult(null), 4000);
    }
  };

  const inputCls = "w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400";

  const platformIcon = (p: WebhookPlatform) => {
    switch (p) {
      case "slack": return "💬";
      case "discord": return "🎮";
      case "teams": return "💼";
      case "google_chat": return "💬";
      default: return "🔗";
    }
  };

  const deliveryRadios: { mode: NotificationDeliveryMode; tKey: TranslationKey }[] = [
    { mode: "none", tKey: "settings.deliveryNone" },
    { mode: "email", tKey: "settings.deliveryEmail" },
    { mode: "slack", tKey: "settings.deliverySlack" },
    { mode: "teams", tKey: "settings.deliveryTeams" },
    { mode: "google_chat", tKey: "settings.deliveryGoogleChat" },
  ];

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-zinc-900 dark:text-slate-100">{t("settings.integrationsTitle")}</h3>
      <p className="text-sm text-zinc-500 dark:text-slate-400">{t("settings.integrationsDesc")}</p>

      <div className="rounded-md border border-zinc-200 dark:border-slate-700 p-4 space-y-4 bg-zinc-50/50 dark:bg-slate-800/30">
        <div>
          <h4 className="text-sm font-semibold text-zinc-800 dark:text-slate-200">{t("settings.notificationDeliveryTitle")}</h4>
          <p className="text-xs text-zinc-500 dark:text-slate-400 mt-1">{t("settings.notificationDeliveryDesc")}</p>
        </div>
        <div className="space-y-2">
          {deliveryRadios.map(({ mode, tKey }) => (
            <label key={mode} className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="notification-delivery"
                checked={deliveryMode === mode}
                onChange={() => setDeliveryMode(mode)}
                className="mt-1"
              />
              <span className="text-sm text-zinc-800 dark:text-slate-200">{t(tKey)}</span>
            </label>
          ))}
        </div>
        {(deliveryMode === "slack" || deliveryMode === "teams" || deliveryMode === "google_chat") && (
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("settings.deliveryWebhookUrl")}</label>
            <input
              type="url"
              value={deliveryUrl}
              onChange={(e) => setDeliveryUrl(e.target.value)}
              placeholder={
                deliveryMode === "slack"
                  ? "https://hooks.slack.com/services/…"
                  : deliveryMode === "teams"
                    ? "https://…webhook.office.com/…"
                    : "https://chat.googleapis.com/v1/spaces/…/messages?key=…"
              }
              className={inputCls}
            />
          </div>
        )}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSaveDelivery()}
            disabled={
              savingDelivery
              || ((deliveryMode === "slack" || deliveryMode === "teams" || deliveryMode === "google_chat") && !deliveryUrl.trim())
            }
            className="rounded bg-slate-700 dark:bg-slate-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {savingDelivery ? t("settings.saving") : t("settings.deliverySave")}
          </button>
          {deliverySaved && <span className="text-xs text-emerald-600 dark:text-emerald-400">{t("settings.deliverySaved")}</span>}
        </div>
      </div>

      {/* ── Notification type filters ── */}
      <div className="rounded-md border border-zinc-200 dark:border-slate-700 p-4 space-y-4 bg-zinc-50/50 dark:bg-slate-800/30">
        <div>
          <h4 className="text-sm font-semibold text-zinc-800 dark:text-slate-200">{t("settings.notifTypesTitle")}</h4>
          <p className="text-xs text-zinc-500 dark:text-slate-400 mt-1">{t("settings.notifTypesDesc")}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left text-xs font-medium text-zinc-500 dark:text-slate-400 pb-2 pr-4">{t("settings.webhookEvents")}</th>
                <th className="text-center text-xs font-medium text-zinc-500 dark:text-slate-400 pb-2 px-3 w-20">{t("settings.notifColInApp")}</th>
                <th className="text-center text-xs font-medium text-zinc-500 dark:text-slate-400 pb-2 px-3 w-20">{t("settings.notifColOutbound")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-slate-700/50">
              {ALL_EVENTS.map(({ key, tKey }) => {
                const inAppEnabled = !disabledInApp.includes(key as NotificationType);
                const outboundEnabled = !disabledOutbound.includes(key as NotificationType);
                return (
                  <tr key={key}>
                    <td className="py-2 pr-4 text-zinc-800 dark:text-slate-200">{t(tKey)}</td>
                    <td className="py-2 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={inAppEnabled}
                        onChange={() => toggleInApp(key as NotificationType)}
                        className="accent-emerald-600"
                      />
                    </td>
                    <td className="py-2 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={outboundEnabled}
                        disabled={!inAppEnabled}
                        onChange={() => toggleOutbound(key as NotificationType)}
                        className="accent-emerald-600 disabled:opacity-40"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSaveTypes()}
            disabled={savingTypes}
            className="rounded bg-slate-700 dark:bg-slate-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {savingTypes ? t("settings.saving") : t("settings.notifTypesSave")}
          </button>
          {typesSaved && <span className="text-xs text-emerald-600 dark:text-emerald-400">{t("settings.notifTypesSaved")}</span>}
        </div>
      </div>

      {/* ── Outbound frequency ── */}
      <div className="rounded-md border border-zinc-200 dark:border-slate-700 p-4 space-y-4 bg-zinc-50/50 dark:bg-slate-800/30">
        <div>
          <h4 className="text-sm font-semibold text-zinc-800 dark:text-slate-200">{t("settings.notifFrequencyTitle")}</h4>
          <p className="text-xs text-zinc-500 dark:text-slate-400 mt-1">{t("settings.notifFrequencyDesc")}</p>
        </div>
        <div className="space-y-2">
          {(["immediate", "hourly_digest", "daily_digest"] as NotificationOutboundFrequency[]).map((freq) => (
            <label key={freq} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="notif-frequency"
                checked={outboundFrequency === freq}
                onChange={() => setOutboundFrequency(freq)}
              />
              <span className="text-sm text-zinc-800 dark:text-slate-200">
                {freq === "immediate" ? t("settings.freqImmediate") : freq === "hourly_digest" ? t("settings.freqHourly") : t("settings.freqDaily")}
              </span>
            </label>
          ))}
        </div>
        {outboundFrequency === "daily_digest" && (
          <div className="flex items-center gap-3 mt-1">
            <label className="text-xs text-zinc-500 dark:text-slate-400 shrink-0">{t("settings.freqDailyHour")}</label>
            <input
              type="number"
              min={0}
              max={23}
              value={digestHour}
              onChange={(e) => setDigestHour(Math.max(0, Math.min(23, Number(e.target.value))))}
              className="w-20 rounded border border-zinc-300 dark:border-slate-600 px-2 py-1 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400"
            />
            <span className="text-xs text-zinc-400 dark:text-slate-500">h</span>
          </div>
        )}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSaveFrequency()}
            disabled={savingFreq}
            className="rounded bg-slate-700 dark:bg-slate-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {savingFreq ? t("settings.saving") : t("settings.freqSave")}
          </button>
          {freqSaved && <span className="text-xs text-emerald-600 dark:text-emerald-400">{t("settings.freqSaved")}</span>}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Existing webhooks */}
          {webhooks.length === 0 && !showForm && (
            <p className="text-sm text-zinc-400 dark:text-slate-500 italic py-4">{t("settings.webhookNone")}</p>
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
                      {wh.enabled ? t("settings.webhookEnabled") : t("settings.webhookDisabled")}
                    </button>
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => handleTest(wh)}
                        disabled={testing === wh.id}
                        className="rounded px-2.5 py-1 text-[11px] font-medium border border-zinc-300 dark:border-slate-600 text-zinc-600 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                      >
                        {testing === wh.id ? "…" : t("settings.webhookTest")}
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
                      {testResult.ok ? t("settings.webhookTestOk") : t("settings.webhookTestFail")}
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
                  <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("settings.webhookLabel")}</label>
                  <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("settings.webhookLabelPlaceholder")} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("settings.webhookPlatform")}</label>
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
                <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("settings.webhookUrl")}</label>
                <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t("settings.webhookUrlPlaceholder")} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-2">{t("settings.webhookEvents")}</label>
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
                            ? "bg-slate-700 text-white dark:bg-slate-600 dark:text-slate-100"
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
                  className="rounded bg-slate-700 dark:bg-slate-600 px-5 py-2 text-sm font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-60 transition-colors"
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
              {t("settings.webhookAdd")}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function ChangePasswordForm() {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const inputCls = "w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400";

  const handleSubmit = async () => {
    setError(null);
    if (next !== confirm) { setError(t("settings.passwordMismatch")); return; }
    setSaving(true);
    try {
      await changePasswordApi(current, next);
      setSuccess(true);
      setCurrent(""); setNext(""); setConfirm("");
      setTimeout(() => { setSuccess(false); setOpen(false); }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally { setSaving(false); }
  };

  if (!open) {
    return (
      <div>
        <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">{t("settings.password")}</label>
        <button type="button" onClick={() => setOpen(true)} className="rounded border border-zinc-300 dark:border-slate-600 px-4 py-2 text-sm text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors">
          {t("settings.changePassword")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4 bg-zinc-50 dark:bg-slate-800/50 rounded-md border border-zinc-200 dark:border-slate-700">
      <h4 className="text-sm font-medium text-zinc-900 dark:text-slate-100">{t("settings.passwordTitle")}</h4>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {success && <p className="text-xs text-emerald-600 dark:text-emerald-400">{t("settings.passwordChanged")}</p>}
      <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder={t("settings.currentPassword")} className={inputCls} />
      <input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder={t("settings.newPassword")} className={inputCls} />
      <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={t("settings.confirmPassword")} className={inputCls} />
      <div className="flex gap-2">
        <button type="button" onClick={handleSubmit} disabled={saving || !current || !next || !confirm}
          className="rounded bg-slate-700 dark:bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-60 transition-colors">
          {t("settings.passwordChange")}
        </button>
        <button type="button" onClick={() => { setOpen(false); setError(null); }}
          className="rounded border border-zinc-300 dark:border-slate-600 px-4 py-2 text-sm text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors">
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}

const ACTION_LABELS: Record<string, { fr: string; en: string }> = {
  create: { fr: "Création", en: "Created" },
  update: { fr: "Modification", en: "Updated" },
  delete: { fr: "Suppression", en: "Deleted" },
  complete: { fr: "Complétée", en: "Completed" },
  cancel: { fr: "Annulée", en: "Cancelled" },
  assign: { fr: "Assignée", en: "Assigned" },
  comment: { fr: "Commentaire", en: "Comment" },
  login: { fr: "Connexion", en: "Login" },
};

const ENTITY_ICONS: Record<string, string> = {
  todo: "📋", project: "📁", team: "👥", note: "📝", comment: "💬", user: "👤",
};

const ENTITY_TYPE_LABELS: Record<string, { fr: string; en: string }> = {
  todo: { fr: "Tâche", en: "Task" },
  project: { fr: "Projet", en: "Project" },
  team: { fr: "Équipe", en: "Team" },
  note: { fr: "Note", en: "Note" },
  comment: { fr: "Commentaire", en: "Comment" },
  user: { fr: "Compte", en: "Account" },
};

function activityDetailsLabel(e: ActivityLogEntry): string | null {
  const d = e.details;
  if (!d || typeof d !== "object") return null;
  const rec = d as Record<string, unknown>;
  if (typeof rec.title === "string" && rec.title.trim()) return rec.title.trim();
  if (typeof rec.name === "string" && rec.name.trim()) return rec.name.trim();
  if (Array.isArray(rec.titles)) {
    const parts = rec.titles.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    if (parts.length) return parts.join(", ");
  }
  return null;
}

function HistorySection() {
  const { t, locale } = useLocale();
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = async (offset = 0) => {
    try {
      const result = await getMyActivity({ limit: 100, offset, days: 7 });
      if (offset === 0) {
        setEntries(result.entries);
      } else {
        setEntries((prev) => [...prev, ...result.entries]);
      }
      setTotal(result.total);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => {
    void Promise.resolve().then(() => {
      void load();
    });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-slate-100">{t("settings.historyTitle")}</h3>
        <p className="text-sm text-zinc-500 dark:text-slate-400">{t("settings.historyDesc")}</p>
        <p className="text-xs font-medium text-violet-700 dark:text-violet-300 mt-2">{t("settings.historyTimeRange")}</p>
      </div>
      {loading ? (
        <p className="text-sm text-zinc-400 dark:text-slate-500">{t("loading")}</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-slate-400">{t("settings.noActivity")}</p>
      ) : (
        <>
          <div className="border border-zinc-200 dark:border-slate-700 rounded-md divide-y divide-zinc-200 dark:divide-slate-700 max-h-[500px] overflow-y-auto">
            {entries.map((e) => {
              const nameLabel = activityDetailsLabel(e);
              const entityKind = ENTITY_TYPE_LABELS[e.entityType]?.[locale] ?? e.entityType;
              const bulkCount =
                e.entityId === "archive-all" && typeof e.details?.count === "number" ? e.details.count : null;
              return (
                <div key={e.id} className="px-4 py-3 flex items-start gap-3">
                  <span className="text-base shrink-0 mt-0.5">{ENTITY_ICONS[e.entityType] ?? "📌"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-800 dark:text-slate-200">
                      <span className="font-medium">{ACTION_LABELS[e.action]?.[locale] ?? e.action}</span>
                      <span className="text-zinc-500 dark:text-slate-500"> · {entityKind}</span>
                      {nameLabel ? (
                        <>
                          <span className="text-zinc-400 dark:text-slate-500"> — </span>
                          <span className="font-medium text-zinc-900 dark:text-slate-100 break-words">{nameLabel}</span>
                        </>
                      ) : null}
                      {bulkCount != null ? (
                        <span className="text-zinc-500 dark:text-slate-400 text-xs font-normal">
                          {" "}
                          ({bulkCount}{" "}
                          {bulkCount > 1 ? (locale === "fr" ? "tâches" : "tasks") : locale === "fr" ? "tâche" : "task"})
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-zinc-400 dark:text-slate-500 mt-0.5">
                      {new Date(e.createdAt).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          {entries.length < total && (
            <button type="button" onClick={() => load(entries.length)} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
              {t("settings.loadMore")} ({entries.length}/{total})
            </button>
          )}
        </>
      )}
    </div>
  );
}

function AdminSection() {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ownedTeams, setOwnedTeams] = useState<Team[]>([]);
  const [transferStep, setTransferStep] = useState(false);
  const [transferChoices, setTransferChoices] = useState<Record<string, string>>({});
  const [transferring, setTransferring] = useState(false);

  const confirmWord = locale === "fr" ? "SUPPRIMER" : "DELETE";

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await getMyExport();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wroket-export-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toast.genericError"));
    } finally { setExporting(false); }
  };

  const handleStartDelete = async () => {
    setError(null);
    try {
      const teams = await getOwnedTeams();
      const teamsWithMembers = teams.filter((t) => t.members.length > 0);
      setOwnedTeams(teamsWithMembers);
      if (teamsWithMembers.length > 0) {
        const initial: Record<string, string> = {};
        for (const team of teamsWithMembers) {
          initial[team.id] = team.members[0]?.email ?? "";
        }
        setTransferChoices(initial);
        setTransferStep(true);
      } else {
        setShowDelete(true);
      }
    } catch {
      setShowDelete(true);
    }
  };

  const handleTransfer = async () => {
    setError(null);
    setTransferring(true);
    try {
      for (const team of ownedTeams) {
        const newOwner = transferChoices[team.id];
        if (newOwner) {
          await transferTeamOwnership(team.id, newOwner);
        }
      }
      setTransferStep(false);
      setShowDelete(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally { setTransferring(false); }
  };

  const handleDelete = async () => {
    setError(null);
    setDeleting(true);
    try {
      await deleteMyAccount(deleteConfirm);
      window.location.href = "/login";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally { setDeleting(false); }
  };

  const allTransfersSelected = ownedTeams.every((team) => transferChoices[team.id]);

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-zinc-900 dark:text-slate-100">{t("settings.adminTitle")}</h3>
      <p className="text-sm text-zinc-500 dark:text-slate-400">{t("settings.adminDesc")}</p>

      <div className="bg-zinc-50 dark:bg-slate-800/50 rounded-md border border-zinc-200 dark:border-slate-700 p-4">
        <h4 className="text-sm font-medium text-zinc-900 dark:text-slate-100 mb-1">{t("settings.dataExport")}</h4>
        <p className="text-xs text-zinc-500 dark:text-slate-400 mb-3">{t("settings.dataExportDesc")}</p>
        <button type="button" onClick={handleExport} disabled={exporting}
          className="rounded bg-slate-700 dark:bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-60 transition-colors">
          {exporting ? "..." : t("settings.exportBtn")}
        </button>
      </div>

      <div className="bg-red-50 dark:bg-red-950/30 rounded-md border border-red-200 dark:border-red-800 p-4">
        <h4 className="text-sm font-medium text-red-700 dark:text-red-400 mb-1">{t("settings.dangerZone")}</h4>
        <p className="text-xs text-red-600/70 dark:text-red-400/70 mb-3">{t("settings.dangerDesc")}</p>

        {transferStep && (
          <div className="space-y-4 mb-4 bg-amber-50 dark:bg-amber-950/30 rounded-md border border-amber-200 dark:border-amber-800 p-4">
            <h5 className="text-sm font-medium text-amber-700 dark:text-amber-400">{t("settings.teamTransferTitle")}</h5>
            <p className="text-xs text-amber-600/70 dark:text-amber-400/70">{t("settings.teamTransferDesc")}</p>
            {error && <p className="text-xs text-red-600">{error}</p>}
            {ownedTeams.map((team) => (
              <div key={team.id} className="flex items-center gap-3">
                <span className="text-sm font-medium text-zinc-800 dark:text-slate-200 min-w-[120px]">{team.name}</span>
                <select
                  value={transferChoices[team.id] ?? ""}
                  onChange={(e) => setTransferChoices((prev) => ({ ...prev, [team.id]: e.target.value }))}
                  className="flex-1 rounded border border-zinc-300 dark:border-slate-600 px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-zinc-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="">{t("settings.teamTransferSelect")}</option>
                  {team.members.map((m) => (
                    <option key={m.email} value={m.email}>{m.email}</option>
                  ))}
                </select>
              </div>
            ))}
            <div className="flex gap-2">
              <button type="button" onClick={handleTransfer} disabled={transferring || !allTransfersSelected}
                className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60 transition-colors">
                {transferring ? t("settings.teamTransferring") : t("settings.teamTransferConfirm")}
              </button>
              <button type="button" onClick={() => { setTransferStep(false); setError(null); }}
                className="rounded border border-zinc-300 dark:border-slate-600 px-4 py-2 text-sm text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors">
                {t("cancel")}
              </button>
            </div>
          </div>
        )}

        {!showDelete && !transferStep ? (
          <button type="button" onClick={handleStartDelete}
            className="rounded border border-red-300 dark:border-red-700 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors">
            {t("settings.deleteAccount")}
          </button>
        ) : showDelete ? (
          <div className="space-y-3">
            <p className="text-xs text-red-600 dark:text-red-400 font-medium">{t("settings.deleteConfirmTitle")}</p>
            <p className="text-xs text-red-600/70 dark:text-red-400/70">{t("settings.deleteConfirmDesc")}</p>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={confirmWord}
              className="w-full max-w-xs rounded border border-red-300 dark:border-red-700 px-3 py-2 text-sm text-red-900 dark:text-red-100 bg-white dark:bg-red-950/50 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
            <div className="flex gap-2">
              <button type="button" onClick={handleDelete} disabled={deleting || deleteConfirm !== confirmWord}
                className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60 transition-colors">
                {deleting ? t("settings.deleting") : t("settings.deleteAccount")}
              </button>
              <button type="button" onClick={() => { setShowDelete(false); setDeleteConfirm(""); setError(null); }}
                className="rounded border border-zinc-300 dark:border-slate-600 px-4 py-2 text-sm text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors">
                {t("cancel")}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
