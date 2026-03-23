"use client";

import { useEffect, useState } from "react";

import { getMe, logout } from "@/lib/api";

interface Me {
  uid: string;
  email: string;
}

export default function TodosPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await getMe();
        if (!cancelled) setMe(res);
      } catch {
        if (!cancelled) window.location.href = "/login";
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      window.location.href = "/login";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        Chargement...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="max-w-2xl mx-auto bg-white shadow rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">
              Liste de tâches
            </h1>
            <p className="text-zinc-600 text-sm mt-1">
              Connecté en tant que {me?.email}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Déconnexion
          </button>
        </div>

        <p className="text-zinc-500">
          V0 : la page est protégée par login. Prochaine étape : CRUD tâches par
          utilisateur.
        </p>
      </div>
    </div>
  );
}

