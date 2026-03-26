"use client";

import { useState } from "react";
import AppShell from "@/components/AppShell";

type Section = "profile" | "languages" | "history" | "admin";

const SECTIONS: { key: Section; label: string; icon: JSX.Element }[] = [
  {
    key: "profile",
    label: "Mon profil",
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  {
    key: "languages",
    label: "Langues",
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
      </svg>
    ),
  },
  {
    key: "history",
    label: "Historique",
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: "admin",
    label: "Administration",
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
  },
];

export default function SettingsPage() {
  const [active, setActive] = useState<Section>("profile");

  return (
    <AppShell>
      <div className="max-w-[1000px] space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-slate-100">Paramètres</h2>
          <p className="text-sm text-zinc-500 dark:text-slate-400 mt-1">Gérez votre compte et vos préférences</p>
        </div>

        <div className="flex gap-6">
          {/* ── Section nav ── */}
          <nav className="w-52 shrink-0 space-y-1">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                onClick={() => setActive(s.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-colors text-left ${
                  active === s.key
                    ? "bg-zinc-100 dark:bg-slate-800 text-zinc-900 dark:text-slate-100"
                    : "text-zinc-500 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800 hover:text-zinc-900 dark:hover:text-slate-100"
                }`}
              >
                {s.icon}
                {s.label}
              </button>
            ))}
          </nav>

          {/* ── Content ── */}
          <div className="flex-1 min-w-0 bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-6">
            {active === "profile" && <ProfileSection />}
            {active === "languages" && <LanguagesSection />}
            {active === "history" && <HistorySection />}
            {active === "admin" && <AdminSection />}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function ProfileSection() {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-zinc-900 dark:text-slate-100">Mon profil</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">Nom complet</label>
          <input
            type="text"
            placeholder="Votre nom"
            className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-zinc-900 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-slate-400"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">Email</label>
          <input
            type="email"
            placeholder="votre@email.com"
            disabled
            className="w-full rounded border border-zinc-200 dark:border-slate-700 px-3 py-2 text-sm text-zinc-400 dark:text-slate-500 bg-zinc-50 dark:bg-slate-800/50 cursor-not-allowed"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">Mot de passe</label>
          <button className="rounded border border-zinc-300 dark:border-slate-600 px-4 py-2 text-sm text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors">
            Modifier le mot de passe
          </button>
        </div>
      </div>
      <div className="pt-4 border-t border-zinc-200 dark:border-slate-700">
        <button className="rounded bg-zinc-900 dark:bg-slate-100 px-5 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-zinc-800 dark:hover:bg-slate-300 transition-colors">
          Enregistrer
        </button>
      </div>
    </div>
  );
}

function LanguagesSection() {
  const [lang, setLang] = useState("fr");

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-zinc-900 dark:text-slate-100">Langues</h3>
      <div>
        <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">Langue de l&apos;interface</label>
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          className="w-full max-w-xs rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-zinc-900 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-slate-400"
        >
          <option value="fr">Français</option>
          <option value="en">English</option>
          <option value="es">Español</option>
          <option value="de">Deutsch</option>
        </select>
      </div>
      <p className="text-xs text-zinc-400 dark:text-slate-500">La modification de la langue sera appliquée à l&apos;ensemble de l&apos;interface.</p>
      <div className="pt-4 border-t border-zinc-200 dark:border-slate-700">
        <button className="rounded bg-zinc-900 dark:bg-slate-100 px-5 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-zinc-800 dark:hover:bg-slate-300 transition-colors">
          Enregistrer
        </button>
      </div>
    </div>
  );
}

function HistorySection() {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-zinc-900 dark:text-slate-100">Historique</h3>
      <p className="text-sm text-zinc-500 dark:text-slate-400">
        Retrouvez l&apos;historique de vos actions récentes.
      </p>
      <div className="border border-zinc-200 dark:border-slate-700 rounded-md divide-y divide-zinc-200 dark:divide-slate-700">
        <div className="px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-zinc-600 dark:text-slate-300">Aucune activité récente</span>
          <span className="text-xs text-zinc-400 dark:text-slate-500">—</span>
        </div>
      </div>
    </div>
  );
}

function AdminSection() {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-zinc-900 dark:text-slate-100">Administration</h3>
      <p className="text-sm text-zinc-500 dark:text-slate-400">
        Options réservées aux administrateurs de l&apos;espace de travail.
      </p>
      <div className="space-y-4">
        <div className="bg-zinc-50 dark:bg-slate-800/50 rounded-md border border-zinc-200 dark:border-slate-700 p-4">
          <h4 className="text-sm font-medium text-zinc-900 dark:text-slate-100 mb-1">Gestion des utilisateurs</h4>
          <p className="text-xs text-zinc-500 dark:text-slate-400">Inviter, supprimer ou modifier les rôles des membres.</p>
        </div>
        <div className="bg-zinc-50 dark:bg-slate-800/50 rounded-md border border-zinc-200 dark:border-slate-700 p-4">
          <h4 className="text-sm font-medium text-zinc-900 dark:text-slate-100 mb-1">Export des données</h4>
          <p className="text-xs text-zinc-500 dark:text-slate-400">Téléchargez un export complet de vos tâches et projets.</p>
        </div>
        <div className="bg-red-50 dark:bg-red-950/30 rounded-md border border-red-200 dark:border-red-800 p-4">
          <h4 className="text-sm font-medium text-red-700 dark:text-red-400 mb-1">Zone de danger</h4>
          <p className="text-xs text-red-600/70 dark:text-red-400/70 mb-3">Ces actions sont irréversibles.</p>
          <button className="rounded border border-red-300 dark:border-red-700 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors">
            Supprimer le compte
          </button>
        </div>
      </div>
    </div>
  );
}
