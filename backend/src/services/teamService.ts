import crypto from "crypto";

import { loadStore, saveStore } from "../persistence";

export interface Collaborator {
  email: string;
  status: "active" | "pending";
}

export interface TeamMember {
  email: string;
  role: "admin" | "member";
}

export interface Team {
  id: string;
  name: string;
  ownerUid: string;
  members: TeamMember[];
  createdAt: string;
}

/** collaborators keyed by owner uid */
const collaboratorsByUser = new Map<string, Collaborator[]>();

/** teams keyed by team id */
const teamsById = new Map<string, Team>();

function persistCollaborators(): void {
  const obj: Record<string, Collaborator[]> = {};
  collaboratorsByUser.forEach((list, uid) => { obj[uid] = list; });
  const store = loadStore();
  store.collaborators = obj;
  saveStore(store);
}

function persistTeams(): void {
  const obj: Record<string, Team> = {};
  teamsById.forEach((team, id) => { obj[id] = team; });
  const store = loadStore();
  store.teams = obj;
  saveStore(store);
}

(function hydrate() {
  const store = loadStore();
  if (store.collaborators) {
    for (const [uid, list] of Object.entries(store.collaborators)) {
      collaboratorsByUser.set(uid, list as Collaborator[]);
    }
    console.log("[teams] collaborateurs chargés pour %d utilisateur(s)", collaboratorsByUser.size);
  }
  if (store.teams) {
    for (const [id, team] of Object.entries(store.teams)) {
      teamsById.set(id, team as Team);
    }
    console.log("[teams] %d équipe(s) chargée(s)", teamsById.size);
  }
})();

// ── Collaborators ──

function getUserCollaborators(uid: string): Collaborator[] {
  let list = collaboratorsByUser.get(uid);
  if (!list) {
    list = [];
    collaboratorsByUser.set(uid, list);
  }
  return list;
}

export function listCollaborators(uid: string): Collaborator[] {
  return getUserCollaborators(uid);
}

export function addCollaborator(uid: string, email: string): Collaborator {
  const normalised = email.trim().toLowerCase();
  if (!normalised || !normalised.includes("@")) throw new Error("Email invalide");

  const list = getUserCollaborators(uid);
  const existing = list.find((c) => c.email === normalised);
  if (existing) return existing;

  const collab: Collaborator = { email: normalised, status: "pending" };
  list.push(collab);
  persistCollaborators();
  return collab;
}

export function removeCollaborator(uid: string, email: string): void {
  const list = getUserCollaborators(uid);
  const idx = list.findIndex((c) => c.email === email);
  if (idx === -1) throw new Error("Collaborateur introuvable");
  list.splice(idx, 1);
  persistCollaborators();
}

// ── Teams ──

export function listTeams(uid: string): Team[] {
  const result: Team[] = [];
  teamsById.forEach((team) => {
    if (team.ownerUid === uid || team.members.some((m) => m.email !== "")) {
      if (team.ownerUid === uid) result.push(team);
    }
  });
  return result.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function listUserTeams(uid: string, userEmail: string): Team[] {
  const result: Team[] = [];
  teamsById.forEach((team) => {
    if (
      team.ownerUid === uid ||
      team.members.some((m) => m.email === userEmail)
    ) {
      result.push(team);
    }
  });
  return result.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getTeam(teamId: string): Team | null {
  return teamsById.get(teamId) ?? null;
}

export function createTeam(
  ownerUid: string,
  name: string,
  memberEmails: string[]
): Team {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Le nom de l'équipe est requis");
  if (trimmed.length > 100) throw new Error("Nom trop long (max 100)");

  const members: TeamMember[] = memberEmails.map((email) => ({
    email: email.trim().toLowerCase(),
    role: "member" as const,
  }));

  const team: Team = {
    id: crypto.randomUUID(),
    name: trimmed,
    ownerUid,
    members,
    createdAt: new Date().toISOString(),
  };

  teamsById.set(team.id, team);
  persistTeams();
  return team;
}

export function addTeamMember(
  teamId: string,
  uid: string,
  email: string
): Team {
  const team = teamsById.get(teamId);
  if (!team) throw new Error("Équipe introuvable");
  if (team.ownerUid !== uid) throw new Error("Non autorisé");

  const normalised = email.trim().toLowerCase();
  if (team.members.some((m) => m.email === normalised)) {
    throw new Error("Ce membre fait déjà partie de l'équipe");
  }

  team.members.push({ email: normalised, role: "member" });
  persistTeams();
  return team;
}

export function removeTeamMember(
  teamId: string,
  uid: string,
  email: string
): Team {
  const team = teamsById.get(teamId);
  if (!team) throw new Error("Équipe introuvable");
  if (team.ownerUid !== uid) throw new Error("Non autorisé");

  const idx = team.members.findIndex((m) => m.email === email);
  if (idx === -1) throw new Error("Membre introuvable");

  team.members.splice(idx, 1);
  persistTeams();
  return team;
}

export function deleteTeam(teamId: string, uid: string): void {
  const team = teamsById.get(teamId);
  if (!team) throw new Error("Équipe introuvable");
  if (team.ownerUid !== uid) throw new Error("Non autorisé");

  teamsById.delete(teamId);
  persistTeams();
}
