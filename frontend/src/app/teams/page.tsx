"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { useLocale } from "@/lib/LocaleContext";
import {
  getCollaborators,
  inviteCollaborator,
  getTeams,
  createTeam,
  Collaborator,
  Team,
} from "@/lib/api";

interface NewTeamMember {
  email: string;
  isNew?: boolean;
}

export default function TeamsPage() {
  const { t } = useLocale();
  const [inviteEmail, setInviteEmail] = useState("");
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);

  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamMembers, setNewTeamMembers] = useState<NewTeamMember[]>([]);
  const [newTeamEmail, setNewTeamEmail] = useState("");
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [collabs, teamList] = await Promise.all([
          getCollaborators(),
          getTeams(),
        ]);
        if (!cancelled) {
          setCollaborators(collabs);
          setTeams(teamList);
        }
      } catch { /* handled by AppShell */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

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

  return (
    <AppShell>
      <div className="max-w-[1000px] space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-slate-100">
              {t("teams.title")}
            </h2>
            <p className="text-sm text-zinc-500 dark:text-slate-400 mt-1">
              {t("teams.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowInvite(!showInvite)}
            className="inline-flex items-center gap-2 rounded-md bg-slate-700 dark:bg-slate-100 px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-300 transition-colors"
          >
            <svg className="w-4 h-4 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            {t("teams.invite")}
          </button>
        </div>

        {/* Invite form */}
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
                className="rounded-md bg-slate-700 dark:bg-slate-100 px-5 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-300 disabled:opacity-60 transition-colors"
              >
                {t("teams.send")}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-zinc-400 dark:text-slate-500 text-sm py-8 text-center">{t("loading")}</p>
        ) : (
          <>
            {/* Collaborators */}
            <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700">
              <div className="px-5 py-4 border-b border-zinc-200 dark:border-slate-700 flex items-center gap-2">
                <svg className="w-5 h-5 text-zinc-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                </svg>
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-slate-300">
                  {t("teams.collaborators")}
                </h3>
                {collaborators.length > 0 && (
                  <span className="text-[11px] font-bold text-zinc-400 bg-zinc-100 dark:bg-slate-800 dark:text-slate-500 rounded-full w-5 h-5 flex items-center justify-center">
                    {collaborators.length}
                  </span>
                )}
              </div>
              <div className="p-5">
                {collaborators.length === 0 ? (
                  <p className="text-sm text-zinc-400 dark:text-slate-500 italic text-center py-6">
                    {t("teams.collaboratorsEmpty")}
                  </p>
                ) : (
                  <ul className="divide-y divide-zinc-100 dark:divide-slate-800">
                    {collaborators.map((collab) => (
                      <li key={collab.email} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                        <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-zinc-500 dark:text-slate-400 uppercase">
                          {collab.email[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-zinc-900 dark:text-slate-100 truncate">
                            {collab.email}
                          </p>
                        </div>
                        {collab.status === "pending" && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            {t("teams.pendingInvite")}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Teams */}
            <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700">
              <div className="px-5 py-4 border-b border-zinc-200 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-zinc-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                  </svg>
                  <h3 className="text-sm font-semibold text-zinc-700 dark:text-slate-300">
                    {t("teams.teamsList")}
                  </h3>
                  {teams.length > 0 && (
                    <span className="text-[11px] font-bold text-zinc-400 bg-zinc-100 dark:bg-slate-800 dark:text-slate-500 rounded-full w-5 h-5 flex items-center justify-center">
                      {teams.length}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={openCreateTeam}
                  className="inline-flex items-center gap-1.5 rounded border border-zinc-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <svg className="w-3.5 h-3.5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  {t("teams.createTeam")}
                </button>
              </div>
              <div className="p-5">
                {teams.length === 0 ? (
                  <p className="text-sm text-zinc-400 dark:text-slate-500 italic text-center py-6">
                    {t("teams.teamsEmpty")}
                  </p>
                ) : (
                  <ul className="divide-y divide-zinc-100 dark:divide-slate-800">
                    {teams.map((team) => {
                      const isExpanded = expandedTeams.has(team.id);
                      const totalMembers = team.members.length + 1;
                      return (
                        <li key={team.id}>
                          <button
                            type="button"
                            onClick={() => setExpandedTeams((prev) => {
                              const next = new Set(prev);
                              if (next.has(team.id)) next.delete(team.id); else next.add(team.id);
                              return next;
                            })}
                            className="w-full flex items-center gap-3 py-3 text-left hover:bg-zinc-50/60 dark:hover:bg-slate-800/40 -mx-2 px-2 rounded transition-colors"
                          >
                            <div className="w-8 h-8 rounded bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase shrink-0">
                              {team.name[0]}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-zinc-900 dark:text-slate-100 truncate">
                                {team.name}
                              </p>
                            </div>
                            <span className="text-xs text-zinc-400 dark:text-slate-500 shrink-0">
                              {totalMembers} {totalMembers > 1 ? t("teams.membersCount") : t("teams.memberCount")}
                            </span>
                            <svg className={`w-4 h-4 text-zinc-400 dark:text-slate-500 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          {isExpanded && (
                            <div className="ml-11 pb-3 space-y-1">
                              <div className="flex items-center gap-2 rounded bg-indigo-50/60 dark:bg-indigo-950/20 px-3 py-1.5 text-sm">
                                <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-[9px] font-bold text-white">
                                  ★
                                </div>
                                <span className="text-zinc-700 dark:text-slate-300">{t("teams.you")}</span>
                                <span className="text-[10px] text-zinc-400 dark:text-slate-500 ml-auto">Admin</span>
                              </div>
                              {team.members.map((member) => (
                                <div key={member.email} className="flex items-center gap-2 rounded bg-zinc-50/60 dark:bg-slate-800/40 px-3 py-1.5 text-sm">
                                  <div className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-slate-700 flex items-center justify-center text-[9px] font-bold text-zinc-500 dark:text-slate-400 uppercase">
                                    {member.email[0]}
                                  </div>
                                  <span className="flex-1 truncate text-zinc-700 dark:text-slate-300">{member.email}</span>
                                  <span className="text-[10px] text-zinc-400 dark:text-slate-500 capitalize">{member.role}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Create Team Modal */}
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
              {/* Team name */}
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

              {/* Add members section */}
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
                    className="rounded bg-slate-700 dark:bg-slate-100 px-4 py-1.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-300 disabled:opacity-60 transition-colors"
                  >
                    {t("teams.send")}
                  </button>
                </div>
              </div>

              {/* Added members list */}
              {newTeamMembers.length > 0 && (
                <div>
                  <p className="text-[11px] text-zinc-400 dark:text-slate-500 uppercase tracking-wide font-semibold mb-1.5">
                    {t("teams.addedMembers")} ({newTeamMembers.length})
                  </p>
                  <ul className="space-y-1">
                    {newTeamMembers.map((member) => (
                      <li key={member.email} className="flex items-center gap-2 rounded bg-zinc-50 dark:bg-slate-800/60 px-3 py-1.5 text-sm">
                        <div className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-[9px] font-bold text-indigo-600 dark:text-indigo-400 uppercase">
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

            {/* Footer */}
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
                  className="rounded bg-slate-700 dark:bg-slate-100 px-5 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-300 disabled:opacity-60 transition-colors"
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
