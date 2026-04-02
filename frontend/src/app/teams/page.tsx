"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { useLocale } from "@/lib/LocaleContext";
import {
  getCollaborators,
  getReceivedInvitations,
  inviteCollaborator,
  removeCollaborator,
  acceptCollaboration,
  declineCollaboration,
  getTeams,
  createTeam,
  updateMemberRoleApi,
  getMe,
  Collaborator,
  ReceivedInvitation,
  Team,
  TeamMemberRole,
} from "@/lib/api";

interface NewTeamMember {
  email: string;
  isNew?: boolean;
}

type Section = "collaborators" | "teams";

export default function TeamsPage() {
  const { t } = useLocale();
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [receivedInvites, setReceivedInvites] = useState<ReceivedInvitation[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeSection, setActiveSection] = useState<Section | null>(null);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");

  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamMembers, setNewTeamMembers] = useState<NewTeamMember[]>([]);
  const [newTeamEmail, setNewTeamEmail] = useState("");

  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [myUid, setMyUid] = useState<string | null>(null);
  const [myEmail, setMyEmail] = useState<string | null>(null);

  useEffect(() => {
    getMe().then((me) => { setMyUid(me.uid); setMyEmail(me.email); }).catch(() => {});
  }, []);

  const refreshData = useCallback(async () => {
    try {
      const [collabs, received, teamList] = await Promise.all([
        getCollaborators(),
        getReceivedInvitations(),
        getTeams(),
      ]);
      setCollaborators(collabs);
      setReceivedInvites(received);
      setTeams(teamList);
    } catch { /* handled by AppShell */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refreshData();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [refreshData]);

  useEffect(() => {
    const onCollabUpdate = () => { refreshData(); };
    const onFocus = () => { refreshData(); };
    window.addEventListener("collaborators-updated", onCollabUpdate);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("collaborators-updated", onCollabUpdate);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshData]);

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !inviteEmail.includes("@")) return;
    if (collaborators.some((c) => c.email === inviteEmail.trim().toLowerCase())) return;
    try {
      const collab = await inviteCollaborator(inviteEmail.trim());
      setCollaborators((prev) => [...prev, collab]);
      setInviteEmail("");
      setShowInvite(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur");
    }
  };

  const openCreateTeam = () => {
    setNewTeamName("");
    setNewTeamMembers([]);
    setNewTeamEmail("");
    setShowCreateTeam(true);
  };

  const addCollaboratorToTeam = (email: string) => {
    if (newTeamMembers.some((m) => m.email === email)) return;
    setNewTeamMembers((prev) => [...prev, { email }]);
  };

  const addEmailToTeam = async () => {
    if (!newTeamEmail.trim() || !newTeamEmail.includes("@")) return;
    const email = newTeamEmail.trim().toLowerCase();
    if (newTeamMembers.some((m) => m.email === email)) return;
    setNewTeamMembers((prev) => [...prev, { email, isNew: true }]);
    if (!collaborators.some((c) => c.email === email)) {
      try {
        const collab = await inviteCollaborator(email);
        setCollaborators((prev) => [...prev, collab]);
      } catch { /* already exists or error */ }
    }
    setNewTeamEmail("");
  };

  const removeMemberFromTeam = (email: string) => {
    setNewTeamMembers((prev) => prev.filter((m) => m.email !== email));
  };

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    try {
      const team = await createTeam(
        newTeamName.trim(),
        newTeamMembers.map((m) => m.email)
      );
      setTeams((prev) => [team, ...prev]);
      setShowCreateTeam(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur");
    }
  };

  const availableCollaborators = collaborators.filter(
    (c) => !newTeamMembers.some((m) => m.email === c.email)
  );

  const activeCollabs = collaborators.filter((c) => c.status === "active");
  const pendingSent = collaborators.filter((c) => c.status === "pending");
  const totalCollabCount = activeCollabs.length + pendingSent.length + receivedInvites.length;

  const goBack = () => {
    setActiveSection(null);
    setShowInvite(false);
  };

  return (
    <AppShell>
      <div className="max-w-[1000px] space-y-6">
        {/* ═══════════════════════════════ OVERVIEW (two summary cards) ═══════════════════════════════ */}
        {!activeSection && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-slate-100">
                  {t("teams.title")}
                </h2>
                <p className="text-sm text-zinc-500 dark:text-slate-400 mt-1">
                  {t("teams.subtitle")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setActiveSection("collaborators"); setShowInvite(true); }}
                  className="inline-flex items-center gap-2 rounded-md bg-slate-700 dark:bg-slate-600 px-4 py-2.5 text-sm font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 transition-colors"
                >
                  <svg className="w-4 h-4 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                  {t("teams.invite")}
                </button>
                <button
                  type="button"
                  onClick={openCreateTeam}
                  className="inline-flex items-center gap-2 rounded-md border border-zinc-300 dark:border-slate-600 px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <svg className="w-4 h-4 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  {t("teams.createTeam")}
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Collaborators summary card */}
                <div
                  onClick={() => setActiveSection("collaborators")}
                  className="relative bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-5 cursor-pointer hover:shadow-md dark:hover:border-slate-500 transition-[color,background-color,border-color,box-shadow] duration-200 group"
                >
                  {receivedInvites.length > 0 && (
                    <span className="absolute -top-2 -right-2 flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-blue-500 text-white text-[10px] font-bold shadow">
                      {receivedInvites.length}
                    </span>
                  )}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-11 h-11 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                      <svg className="w-6 h-6 text-slate-500 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-zinc-900 dark:text-slate-100 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">
                        {t("teams.collaborators")}
                      </p>
                      <p className="text-xs text-zinc-400 dark:text-slate-500">
                        {totalCollabCount === 0
                          ? t("teams.collaboratorsEmpty")
                          : `${activeCollabs.length} ${t("teams.activeCollabs").toLowerCase()}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      {activeCollabs.length > 0 && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                          {activeCollabs.length} {t("teams.activeCollabs").toLowerCase()}
                        </span>
                      )}
                      {pendingSent.length > 0 && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          {pendingSent.length} {t("teams.pendingInvite").toLowerCase()}
                        </span>
                      )}
                      {receivedInvites.length > 0 && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                          {receivedInvites.length} {t("teams.receivedInvites").toLowerCase()}
                        </span>
                      )}
                    </div>
                    <svg className="w-4 h-4 text-zinc-300 dark:text-slate-600 group-hover:text-zinc-500 dark:group-hover:text-slate-400 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>

                {/* Teams summary card */}
                <div
                  onClick={() => setActiveSection("teams")}
                  className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-5 cursor-pointer hover:shadow-md dark:hover:border-slate-500 transition-[color,background-color,border-color,box-shadow] duration-200 group"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-11 h-11 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                      <svg className="w-6 h-6 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-zinc-900 dark:text-slate-100 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">
                        {t("teams.teamsList")}
                      </p>
                      <p className="text-xs text-zinc-400 dark:text-slate-500">
                        {teams.length === 0
                          ? t("teams.teamsEmpty")
                          : `${teams.length} ${t("teams.teamsList").toLowerCase()}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    {teams.length > 0 ? (
                      <div className="flex -space-x-1.5">
                        {teams.slice(0, 5).map((team) => (
                          <div key={team.id} className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 ring-2 ring-white dark:ring-slate-900 flex items-center justify-center text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">
                            {team.name[0]}
                          </div>
                        ))}
                        {teams.length > 5 && (
                          <div className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-slate-800 ring-2 ring-white dark:ring-slate-900 flex items-center justify-center text-[9px] font-bold text-zinc-400 dark:text-slate-500">
                            +{teams.length - 5}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div />
                    )}
                    <svg className="w-4 h-4 text-zinc-300 dark:text-slate-600 group-hover:text-zinc-500 dark:group-hover:text-slate-400 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ═══════════════════════════════ COLLABORATORS DETAIL ═══════════════════════════════ */}
        {activeSection === "collaborators" && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={goBack}
                  className="rounded-md p-2 text-zinc-400 hover:text-zinc-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-zinc-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div>
                  <h2 className="text-xl font-bold text-zinc-900 dark:text-slate-100">
                    {t("teams.collaborators")}
                  </h2>
                  <p className="text-xs text-zinc-400 dark:text-slate-500">
                    {totalCollabCount} {t("teams.collaborators").toLowerCase()}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowInvite(!showInvite)}
                className="inline-flex items-center gap-2 rounded-md bg-slate-700 dark:bg-slate-600 px-4 py-2.5 text-sm font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 transition-colors"
              >
                <svg className="w-4 h-4 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                {t("teams.invite")}
              </button>
            </div>

            {showInvite && (
              <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-5">
                <p className="text-sm text-zinc-600 dark:text-slate-400 mb-3">
                  {t("teams.inviteDesc")}
                </p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder={t("teams.emailPlaceholder")}
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleInvite(); }}
                    autoFocus
                    className="flex-1 rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400"
                  />
                  <button
                    type="button"
                    onClick={handleInvite}
                    disabled={!inviteEmail.trim() || !inviteEmail.includes("@")}
                    className="rounded-md bg-slate-700 dark:bg-slate-600 px-5 py-2 text-sm font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-60 transition-colors"
                  >
                    {t("teams.send")}
                  </button>
                </div>
              </div>
            )}

            <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700">
              {/* Received invitations */}
              {receivedInvites.length > 0 && (
                <div className="p-5 border-b border-zinc-100 dark:border-slate-800">
                  <p className="text-[11px] text-zinc-400 dark:text-slate-500 uppercase tracking-wide font-semibold mb-3 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    {t("teams.receivedInvites")}
                    <span className="text-[10px] font-bold text-white bg-blue-500 rounded-full w-4 h-4 flex items-center justify-center">
                      {receivedInvites.length}
                    </span>
                  </p>
                  <ul className="space-y-2">
                    {receivedInvites.map((inv) => (
                      <li key={inv.fromEmail} className="flex items-center gap-3 rounded-md bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/50 px-4 py-3">
                        <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-400 uppercase shrink-0">
                          {inv.fromEmail[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-zinc-900 dark:text-slate-100 truncate">{inv.fromEmail}</p>
                          <p className="text-[10px] text-blue-600 dark:text-blue-400">{t("teams.receivedInviteDesc")}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await acceptCollaboration(inv.fromEmail);
                                await refreshData();
                                window.dispatchEvent(new Event("collaborators-updated"));
                              } catch { /* ignore */ }
                            }}
                            className="rounded px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                          >
                            {t("notif.accept")}
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await declineCollaboration(inv.fromEmail);
                                setReceivedInvites((prev) => prev.filter((i) => i.fromEmail !== inv.fromEmail));
                                window.dispatchEvent(new Event("collaborators-updated"));
                              } catch { /* ignore */ }
                            }}
                            className="rounded px-3 py-1.5 text-xs font-medium border border-zinc-300 dark:border-slate-600 text-zinc-600 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            {t("notif.decline")}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Sent invitations (pending) */}
              {pendingSent.length > 0 && (
                <div className="p-5 border-b border-zinc-100 dark:border-slate-800">
                  <p className="text-[11px] text-zinc-400 dark:text-slate-500 uppercase tracking-wide font-semibold mb-3 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    {t("teams.sentInvites")}
                    <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 rounded-full w-4 h-4 flex items-center justify-center">
                      {pendingSent.length}
                    </span>
                  </p>
                  <ul className="divide-y divide-zinc-100 dark:divide-slate-800">
                    {pendingSent.map((collab) => (
                      <li key={collab.email} className="group flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                        <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-xs font-bold text-amber-600 dark:text-amber-400 uppercase shrink-0">
                          {collab.email[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-zinc-900 dark:text-slate-100 truncate">{collab.email}</p>
                        </div>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          {t("teams.pendingInvite")}
                        </span>
                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await removeCollaborator(collab.email);
                                const re = await inviteCollaborator(collab.email);
                                setCollaborators((prev) => prev.map((c) => c.email === collab.email ? re : c));
                              } catch { /* ignore */ }
                            }}
                            title={t("teams.resendInvite")}
                            className="rounded p-1.5 text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-zinc-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await removeCollaborator(collab.email);
                                setCollaborators((prev) => prev.filter((c) => c.email !== collab.email));
                              } catch { /* ignore */ }
                            }}
                            title={t("teams.removeCollab")}
                            className="rounded p-1.5 text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-zinc-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Active collaborators */}
              <div className="p-5">
                {activeCollabs.length > 0 && (
                  <p className="text-[11px] text-zinc-400 dark:text-slate-500 uppercase tracking-wide font-semibold mb-3 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {t("teams.activeCollabs")}
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 rounded-full w-4 h-4 flex items-center justify-center">
                      {activeCollabs.length}
                    </span>
                  </p>
                )}
                {activeCollabs.length === 0 && pendingSent.length === 0 && receivedInvites.length === 0 ? (
                  <p className="text-sm text-zinc-400 dark:text-slate-500 italic text-center py-6">
                    {t("teams.collaboratorsEmpty")}
                  </p>
                ) : activeCollabs.length === 0 ? null : (
                  <ul className="divide-y divide-zinc-100 dark:divide-slate-800">
                    {activeCollabs.map((collab) => (
                      <li key={collab.email} className="group flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                        <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase shrink-0">
                          {collab.email[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-zinc-900 dark:text-slate-100 truncate">{collab.email}</p>
                        </div>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                          ✓
                        </span>
                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await removeCollaborator(collab.email);
                                setCollaborators((prev) => prev.filter((c) => c.email !== collab.email));
                              } catch { /* ignore */ }
                            }}
                            title={t("teams.removeCollab")}
                            className="rounded p-1.5 text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-zinc-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}

        {/* ═══════════════════════════════ TEAMS DETAIL ═══════════════════════════════ */}
        {activeSection === "teams" && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={goBack}
                  className="rounded-md p-2 text-zinc-400 hover:text-zinc-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-zinc-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div>
                  <h2 className="text-xl font-bold text-zinc-900 dark:text-slate-100">
                    {t("teams.teamsList")}
                  </h2>
                  <p className="text-xs text-zinc-400 dark:text-slate-500">
                    {teams.length} {t("teams.teamsList").toLowerCase()}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={openCreateTeam}
                className="inline-flex items-center gap-2 rounded-md bg-slate-700 dark:bg-slate-600 px-4 py-2.5 text-sm font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 transition-colors"
              >
                <svg className="w-4 h-4 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                {t("teams.createTeam")}
              </button>
            </div>

            {teams.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-10 text-center">
                <svg className="w-12 h-12 mx-auto text-zinc-300 dark:text-slate-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                </svg>
                <p className="text-sm text-zinc-400 dark:text-slate-500">{t("teams.teamsEmpty")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {teams.map((team) => {
                  const isExpanded = expandedTeams.has(team.id);
                  const totalMembers = team.members.length + 1;
                  return (
                    <div key={team.id} className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setExpandedTeams((prev) => {
                          const next = new Set(prev);
                          if (next.has(team.id)) next.delete(team.id); else next.add(team.id);
                          return next;
                        })}
                        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-zinc-50/60 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-sm font-bold text-emerald-600 dark:text-emerald-400 uppercase shrink-0">
                          {team.name[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-zinc-900 dark:text-slate-100 truncate">{team.name}</p>
                          <p className="text-[10px] text-zinc-400 dark:text-slate-500">
                            {totalMembers} {totalMembers > 1 ? t("teams.membersCount") : t("teams.memberCount")}
                          </p>
                        </div>
                        <div className="flex -space-x-1.5 mr-2">
                          <div className="w-6 h-6 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900 flex items-center justify-center text-[8px] font-bold text-white">★</div>
                          {team.members.slice(0, 3).map((m) => (
                            <div key={m.email} className="w-6 h-6 rounded-full bg-zinc-200 dark:bg-slate-700 ring-2 ring-white dark:ring-slate-900 flex items-center justify-center text-[8px] font-bold text-zinc-500 dark:text-slate-400 uppercase">
                              {m.email[0]}
                            </div>
                          ))}
                          {team.members.length > 3 && (
                            <div className="w-6 h-6 rounded-full bg-zinc-100 dark:bg-slate-800 ring-2 ring-white dark:ring-slate-900 flex items-center justify-center text-[8px] font-bold text-zinc-400 dark:text-slate-500">
                              +{team.members.length - 3}
                            </div>
                          )}
                        </div>
                        <svg className={`w-4 h-4 text-zinc-400 dark:text-slate-500 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {isExpanded && (() => {
                        const isOwner = myUid === team.ownerUid;
                        const myMember = team.members.find((m) => m.email === myEmail);
                        const isAdmin = isOwner || myMember?.role === "admin";

                        const ROLE_STYLE: Record<TeamMemberRole, { label: string; cls: string }> = {
                          admin:        { label: t("teams.admin"),     cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
                          "super-user": { label: t("teams.superUser"), cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
                          user:         { label: t("teams.user"),      cls: "bg-zinc-100 text-zinc-500 dark:bg-slate-800 dark:text-slate-400" },
                        };

                        return (
                          <div className="px-5 pb-4 space-y-1.5 border-t border-zinc-100 dark:border-slate-800 pt-3">
                            {/* Owner row */}
                            <div className="flex items-center gap-2 rounded bg-emerald-50/60 dark:bg-emerald-950/20 px-3 py-2 text-sm">
                              <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center text-[10px] font-bold text-white">★</div>
                              <span className="text-zinc-700 dark:text-slate-300 font-medium">
                                {isOwner ? t("teams.you") : "Owner"}
                              </span>
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 ml-auto">
                                {t("teams.owner")}
                              </span>
                            </div>

                            {/* Members */}
                            {team.members.map((member) => {
                              const style = ROLE_STYLE[member.role] ?? ROLE_STYLE.user;

                              return (
                                <div key={member.email} className="flex items-center gap-2 rounded bg-zinc-50/60 dark:bg-slate-800/40 px-3 py-2 text-sm">
                                  <div className="w-7 h-7 rounded-full bg-zinc-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold text-zinc-500 dark:text-slate-400 uppercase">
                                    {member.email[0]}
                                  </div>
                                  <span className="flex-1 truncate text-zinc-700 dark:text-slate-300">{member.email}</span>

                                  {isAdmin ? (
                                    <select
                                      value={member.role}
                                      onChange={async (e) => {
                                        const newRole = e.target.value as TeamMemberRole;
                                        try {
                                          const updated = await updateMemberRoleApi(team.id, member.email, newRole);
                                          setTeams((prev) => prev.map((t2) => t2.id === team.id ? updated : t2));
                                        } catch (err) {
                                          alert(err instanceof Error ? err.message : "Erreur");
                                        }
                                      }}
                                      className="text-[11px] font-medium rounded border border-zinc-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-zinc-700 dark:text-slate-300 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-slate-500 cursor-pointer"
                                    >
                                      <option value="admin">{t("teams.admin")}</option>
                                      <option value="super-user">{t("teams.superUser")}</option>
                                      <option value="user">{t("teams.user")} ({t("teams.readOnly")})</option>
                                    </select>
                                  ) : (
                                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${style.cls}`}>
                                      {style.label}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Create Team Modal ── */}
      {showCreateTeam && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShowCreateTeam(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-lg shadow-2xl border border-zinc-200 dark:border-slate-700 w-full max-w-lg mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-slate-100 mb-4">
              {t("teams.createTeam")}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
                  {t("teams.teamName")}
                </label>
                <input
                  type="text"
                  placeholder={t("teams.teamNamePlaceholder")}
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  autoFocus
                  className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-2">
                  {t("teams.addMembers")}
                </label>

                {availableCollaborators.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[11px] text-zinc-400 dark:text-slate-500 uppercase tracking-wide font-semibold mb-1.5">
                      {t("teams.fromCollaborators")}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {availableCollaborators.map((collab) => (
                        <button
                          key={collab.email}
                          type="button"
                          onClick={() => addCollaboratorToTeam(collab.email)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 dark:border-slate-600 px-3 py-1 text-xs text-zinc-700 dark:text-slate-300 hover:bg-zinc-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <div className="w-4 h-4 rounded-full bg-zinc-200 dark:bg-slate-700 flex items-center justify-center text-[8px] font-bold text-zinc-500 dark:text-slate-400 uppercase">
                            {collab.email[0]}
                          </div>
                          {collab.email}
                          <svg className="w-3 h-3 text-green-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-[11px] text-zinc-400 dark:text-slate-500 uppercase tracking-wide font-semibold mb-1.5">
                  {t("teams.orInviteByEmail")}
                </p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder={t("teams.emailPlaceholder")}
                    value={newTeamEmail}
                    onChange={(e) => setNewTeamEmail(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addEmailToTeam(); }}
                    className="flex-1 rounded border border-zinc-300 dark:border-slate-600 px-3 py-1.5 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400"
                  />
                  <button
                    type="button"
                    onClick={addEmailToTeam}
                    disabled={!newTeamEmail.trim() || !newTeamEmail.includes("@")}
                    className="rounded bg-slate-700 dark:bg-slate-600 px-4 py-1.5 text-sm font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-60 transition-colors"
                  >
                    {t("teams.send")}
                  </button>
                </div>
              </div>

              {newTeamMembers.length > 0 && (
                <div>
                  <p className="text-[11px] text-zinc-400 dark:text-slate-500 uppercase tracking-wide font-semibold mb-1.5">
                    {t("teams.addedMembers")} ({newTeamMembers.length})
                  </p>
                  <ul className="space-y-1">
                    {newTeamMembers.map((member) => (
                      <li key={member.email} className="flex items-center gap-2 rounded bg-zinc-50 dark:bg-slate-800/60 px-3 py-1.5 text-sm">
                        <div className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[9px] font-bold text-slate-600 dark:text-slate-300 uppercase">
                          {member.email[0]}
                        </div>
                        <span className="flex-1 truncate text-zinc-700 dark:text-slate-300">{member.email}</span>
                        {member.isNew && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            {t("teams.pendingInvite")}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => removeMemberFromTeam(member.email)}
                          className="text-zinc-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400"
                        >
                          <svg className="w-3.5 h-3.5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex items-center mt-5">
              <p className="text-xs text-zinc-400 dark:text-slate-500">
                {t("teams.you")} + {newTeamMembers.length} {newTeamMembers.length > 1 ? t("teams.membersCount") : t("teams.memberCount")}
              </p>
              <div className="flex gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => setShowCreateTeam(false)}
                  className="rounded border border-zinc-200 dark:border-slate-600 px-4 py-2 text-sm font-medium text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
                >
                  {t("teams.cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleCreateTeam}
                  disabled={!newTeamName.trim()}
                  className="rounded bg-slate-700 dark:bg-slate-600 px-5 py-2 text-sm font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-60 transition-colors"
                >
                  {t("teams.create")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
