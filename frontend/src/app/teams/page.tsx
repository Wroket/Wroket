"use client";

import AppShell from "@/components/AppShell";

export default function TeamsPage() {
  return (
    <AppShell>
      <div className="max-w-[1000px] space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-slate-100">Mes équipes</h2>
          <p className="text-sm text-zinc-500 dark:text-slate-400 mt-1">Collaborez avec vos collègues</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-10 text-center">
          <svg className="w-12 h-12 mx-auto text-zinc-300 dark:text-slate-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <p className="text-sm text-zinc-500 dark:text-slate-400">Cette fonctionnalité sera bientôt disponible.</p>
        </div>
      </div>
    </AppShell>
  );
}
