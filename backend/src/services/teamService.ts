import crypto from "crypto";

import { getStore, scheduleSave } from "../persistence";
import { findUserByUid } from "./authService";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";

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
  const store = getStore();
  store.collaborators = obj;
  scheduleSave();
}

function persistTeams(): void {
  const obj: Record<string, Team> = {};
  teamsById.forEach((team, id) => { obj[id] = team; });
  const store = getStore();
  store.teams = obj;
  scheduleSave();
}

(function hydrate() {
  const store = getStore();
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

export interface ReceivedInvitation {
  fromEmail: string;
}

/**
 * Scan every user's collaborator list to find pending entries
 * matching `userEmail` — these are invitations sent TO this user.
 */
export function listReceivedInvitations(uid: string, userEmail: string): ReceivedInvitation[] {
  const normalised = userEmail.trim().toLowerCase();
  const received: ReceivedInvitation[] = [];
  collaboratorsByUser.forEach((list, ownerUid) => {
    if (ownerUid === uid) return;
    const entry = list.find((c) => c.email === normalised && c.status === "pending");
    if (entry) {
      const owner = findUserByUid(ownerUid);
      received.push({ fromEmail: owner?.email ?? ownerUid });
    }
  });
  return received;
}

export function addCollaborator(uid: string, email: string): Collaborator {
  const normalised = email.trim().toLowerCase();
  if (!normalised || !normalised.includes("@")) throw new ValidationError("Email invalide");

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
  if (idx === -1) throw new NotFoundError("Collaborateur introuvable");
  list.splice(idx, 1);
  persistCollaborators();
}

/**
 * Accept a collaboration invite: mark inviter's entry as active
 * and add the inviter as a collaborator for the invitee (reciprocal).
 */
export function acceptCollaboration(inviteeUid: string, inviteeEmail: string, inviterUid: string, inviterEmail: string): void {
  const inviterList = getUserCollaborators(inviterUid);
  const entry = inviterList.find((c) => c.email === inviteeEmail);
  if (entry) {
    entry.status = "active";
  }

  const inviteeList = getUserCollaborators(inviteeUid);
  if (!inviteeList.find((c) => c.email === inviterEmail)) {
    inviteeList.push({ email: inviterEmail, status: "active" });
  }

  persistCollaborators();
}

/**
 * Decline a collaboration invite: remove the entry from inviter's list.
 */
export function declineCollaboration(inviterUid: string, inviteeEmail: string): void {
  const list = getUserCollaborators(inviterUid);
  const idx = list.findIndex((c) => c.email === inviteeEmail);
  if (idx !== -1) {
    list.splice(idx, 1);
    persistCollaborators();
  }
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
  if (!trimmed) throw new ValidationError("Le nom de l'équipe est requis");
  if (trimmed.length > 100) throw new ValidationError("Nom trop long (max 100)");

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
  if (!team) throw new NotFoundError("Équipe introuvable");
  if (team.ownerUid !== uid) throw new ForbiddenError("Non autorisé");

  const normalised = email.trim().toLowerCase();
  if (team.members.some((m) => m.email === normalised)) {
    throw new ValidationError("Ce membre fait déjà partie de l'équipe");
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
  if (!team) throw new NotFoundError("Équipe introuvable");
  if (team.ownerUid !== uid) throw new ForbiddenError("Non autorisé");

  const idx = team.members.findIndex((m) => m.email === email);
  if (idx === -1) throw new NotFoundError("Membre introuvable");

  team.members.splice(idx, 1);
  persistTeams();
  return team;
}

export function deleteTeam(teamId: string, uid: string): void {
  const team = teamsById.get(teamId);
  if (!team) throw new NotFoundError("Équipe introuvable");
  if (team.ownerUid !== uid) throw new ForbiddenError("Non autorisé");

  teamsById.delete(teamId);
  persistTeams();
}
