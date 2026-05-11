import crypto from "crypto";

import { getStore, scheduleSave } from "../persistence";
import { findUserByUid, getEntitlementsForUid } from "./authService";
import { assertValidEmailFormat } from "../utils/emailValidation";
import { ForbiddenError, NotFoundError, PaymentRequiredError, ValidationError } from "../utils/errors";
import {
  resolveEffectiveEntitlements,
  normalizeBillingPlan,
  type BillingPlan,
  type Entitlements,
} from "./entitlementsService";

export interface Collaborator {
  email: string;
  status: "active" | "pending";
}

export type TeamRole = "owner" | "co-owner" | "admin" | "super-user" | "user";

export interface TeamMember {
  email: string;
  role: "co-owner" | "admin" | "super-user" | "user";
}

/**
 * Collaborateur externe d'une équipe : invité ponctuel, NON couvert par le plan de l'équipe.
 * Conserve son propre billingPlan personnel.
 */
export interface TeamCollaborator {
  email: string;
  status: "pending" | "active";
}

export interface Team {
  id: string;
  name: string;
  ownerUid: string;
  members: TeamMember[];
  createdAt: string;
  /** Plan commercial de l'équipe (hérité du Stripe de l'owner). Défaut : "free". */
  billingPlan?: BillingPlan;
  /** Nombre de sièges couverts par l'abonnement (owner + membres). Défaut : Infinity = pas de limite. */
  seatCount?: number;
  /** Stripe Subscription id lié à l'abonnement équipe. */
  stripeSubscriptionId?: string;
  /** Collaborateurs externes (plan propre, non comptés dans les sièges). */
  collaborators?: TeamCollaborator[];
}

/** collaborators keyed by owner uid */
const collaboratorsByUser = new Map<string, Collaborator[]>();

/** teams keyed by team id */
const teamsById = new Map<string, Team>();

function assertValidRosterEmail(email: string, label = "Email"): void {
  assertValidEmailFormat(email, `${label} invalide`);
}

function persistCollaborators(): void {
  const obj: Record<string, Collaborator[]> = {};
  collaboratorsByUser.forEach((list, uid) => { obj[uid] = list; });
  const store = getStore();
  store.collaborators = obj;
  scheduleSave("collaborators");
}

function persistTeams(): void {
  const obj: Record<string, Team> = {};
  teamsById.forEach((team, id) => { obj[id] = team; });
  const store = getStore();
  store.teams = obj;
  scheduleSave("teams");
}

/** Nombre de sièges effectivement occupés (owner inclus). */
function usedSeats(team: Team): number {
  return 1 + team.members.length;
}

/** Nombre de sièges disponibles. Infinity quand aucun abonnement actif (pas de limite imposée). */
function availableSeats(team: Team): number {
  return team.seatCount ?? Infinity;
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
    let migrated = 0;
    for (const [id, team] of Object.entries(store.teams)) {
      const t = team as Team;
      for (const m of t.members) {
        if ((m.role as string) === "member") {
          m.role = "user";
          migrated++;
        }
      }
      // Fallbacks pour les équipes existantes sans les nouveaux champs billing
      if (!t.billingPlan) t.billingPlan = "free";
      if (t.seatCount === undefined) t.seatCount = undefined; // conserver Infinity implicite
      if (!Array.isArray(t.collaborators)) t.collaborators = [];
      teamsById.set(id, t);
    }
    console.log("[teams] %d équipe(s) chargée(s)", teamsById.size);
    if (migrated > 0) {
      console.log("[teams] %d membre(s) migrés de 'member' vers 'user'", migrated);
      persistTeams();
    }

    // Cleanup orphan teams whose owner no longer exists
    const users = (store.users ?? {}) as Record<string, unknown>;
    let orphanCount = 0;
    for (const [id, team] of teamsById.entries()) {
      if (!users[team.ownerUid]) {
        teamsById.delete(id);
        orphanCount++;
      }
    }
    if (orphanCount > 0) {
      console.log("[teams] %d orphan team(s) deleted (owner no longer exists)", orphanCount);
      persistTeams();
    }
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

/** Returns the collaborator row for `email` on `uid`'s list, if any. */
export function findCollaborator(uid: string, email: string): Collaborator | undefined {
  const normalised = email.trim().toLowerCase();
  return getUserCollaborators(uid).find((c) => c.email === normalised);
}

/** True if this email is a confirmed collaborator (not only pending invite). */
export function isActiveCollaborator(ownerUid: string, email: string): boolean {
  const c = findCollaborator(ownerUid, email);
  return c?.status === "active";
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
  const normalised = email.trim().toLowerCase();
  const list = getUserCollaborators(uid);
  const idx = list.findIndex((c) => c.email === normalised);
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

/**
 * Returns the effective role of a user in a team.
 * Owner is implicit (not stored in members array).
 */
export function getTeamRole(team: Team, uid: string, userEmail: string): TeamRole | null {
  if (team.ownerUid === uid) return "owner";
  const member = team.members.find((m) => m.email === userEmail.toLowerCase());
  if (!member) return null;
  return member.role;
}

/**
 * Returns true if the user can manage the team (invite/remove members, assign roles, edit team).
 * Owner, co-owner, or admin.
 */
export function canManageTeam(team: Team, uid: string, userEmail: string): boolean {
  const role = getTeamRole(team, uid, userEmail);
  return role === "owner" || role === "co-owner" || role === "admin";
}

/**
 * Returns true if the user can create/edit the project itself (settings, name, etc.).
 * Owner, co-owner, or admin.
 */
export function canManageProjects(team: Team, uid: string, userEmail: string): boolean {
  const role = getTeamRole(team, uid, userEmail);
  return role === "owner" || role === "co-owner" || role === "admin";
}

/**
 * Returns true if the user can read/write tasks, phases and sub-projects.
 * Requires owner, co-owner, admin or super-user role.
 */
export function canEditContent(team: Team, uid: string, userEmail: string): boolean {
  const role = getTeamRole(team, uid, userEmail);
  return role === "owner" || role === "co-owner" || role === "admin" || role === "super-user";
}

const VALID_MEMBER_ROLES = new Set<TeamMember["role"]>(["co-owner", "admin", "super-user", "user"]);

/**
 * Updates the role of a team member. Only owner or admin can change roles.
 */
export function updateMemberRole(teamId: string, uid: string, userEmail: string, memberEmail: string, newRole: TeamMember["role"]): Team {
  const team = teamsById.get(teamId);
  if (!team) throw new NotFoundError("Équipe introuvable");
  if (!canManageTeam(team, uid, userEmail)) throw new ForbiddenError("Seuls les admins peuvent changer les rôles");
  if (!VALID_MEMBER_ROLES.has(newRole)) throw new ValidationError("Rôle invalide");

  const normalised = memberEmail.trim().toLowerCase();
  const member = team.members.find((m) => m.email === normalised);
  if (!member) throw new NotFoundError("Membre introuvable");

  member.role = newRole;
  persistTeams();
  return team;
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

/**
 * All distinct emails the user may want to pick for assignment / invites:
 * collaborators + team owners + team members (teams the user belongs to).
 * Excludes the user's own email.
 */
export function listKnownContactEmails(uid: string, userEmail: string): string[] {
  const me = userEmail.trim().toLowerCase();
  const set = new Set<string>();

  for (const c of listCollaborators(uid)) {
    if (c.email) set.add(c.email);
  }

  for (const team of listUserTeams(uid, me)) {
    const owner = findUserByUid(team.ownerUid);
    if (owner?.email) set.add(owner.email.trim().toLowerCase());
    for (const m of team.members) {
      if (m.email) set.add(m.email);
    }
  }

  set.delete(me);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/** Substring match on precomputed pool (min query length enforced by caller). */
export function filterContactEmailsByQuery(
  candidates: string[],
  queryRaw: string,
  minLen: number,
  maxResults: number,
): string[] {
  const q = queryRaw.trim().toLowerCase();
  if (q.length < minLen) return [];
  return candidates.filter((e) => e.includes(q)).slice(0, maxResults);
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

  const members: TeamMember[] = memberEmails.map((email) => {
    assertValidRosterEmail(email, "Email membre");
    return {
      email: email.trim().toLowerCase(),
      role: "user" as const,
    };
  });

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
  userEmail: string,
  email: string
): Team {
  const team = teamsById.get(teamId);
  if (!team) throw new NotFoundError("Équipe introuvable");
  if (!canManageTeam(team, uid, userEmail)) throw new ForbiddenError("Non autorisé");

  assertValidRosterEmail(email, "Email");
  const normalised = email.trim().toLowerCase();
  if (team.members.some((m) => m.email === normalised)) {
    throw new ValidationError("Ce membre fait déjà partie de l'équipe");
  }

  const seats = availableSeats(team);
  if (usedSeats(team) >= seats) {
    const planLabel = team.billingPlan === "small" ? "Small teams (5 sièges max)" : "votre plan actuel";
    throw new PaymentRequiredError(
      `Quota de sièges atteint pour ${planLabel}. Passez au plan Large teams pour ajouter davantage de membres.`,
    );
  }

  team.members.push({ email: normalised, role: "user" });
  persistTeams();
  return team;
}

export function removeTeamMember(
  teamId: string,
  uid: string,
  userEmail: string,
  email: string
): Team {
  const team = teamsById.get(teamId);
  if (!team) throw new NotFoundError("Équipe introuvable");
  if (!canManageTeam(team, uid, userEmail)) throw new ForbiddenError("Non autorisé");

  const normalised = email.trim().toLowerCase();
  const idx = team.members.findIndex((m) => m.email === normalised);
  if (idx === -1) throw new NotFoundError("Membre introuvable");

  team.members.splice(idx, 1);
  persistTeams();
  return team;
}

export function listOwnedTeams(uid: string): Team[] {
  const result: Team[] = [];
  teamsById.forEach((team) => {
    if (team.ownerUid === uid) result.push(team);
  });
  return result;
}

export function transferTeamOwnership(teamId: string, uid: string, userEmail: string, newOwnerEmail: string): Team {
  const team = teamsById.get(teamId);
  if (!team) throw new NotFoundError("Équipe introuvable");
  const role = getTeamRole(team, uid, userEmail);
  if (role !== "owner" && role !== "co-owner") {
    throw new ForbiddenError("Seul le propriétaire ou un co-propriétaire peut transférer");
  }

  const normalised = newOwnerEmail.trim().toLowerCase();
  const member = team.members.find((m) => m.email === normalised);
  if (!member) throw new ValidationError("Le nouveau propriétaire doit être membre de l'équipe");

  team.members = team.members.filter((m) => m.email !== normalised);
  team.ownerUid = findUidByEmail(normalised);
  persistTeams();
  return team;
}

function findUidByEmail(email: string): string {
  const store = getStore();
  const users = (store.users ?? {}) as Record<string, Record<string, unknown>>;
  for (const [uid, u] of Object.entries(users)) {
    if ((u.email as string)?.toLowerCase() === email) return uid;
  }
  throw new NotFoundError("Utilisateur introuvable pour cet email");
}

// ── Team Collaborators (externes, plan propre) ──

export function listTeamCollaborators(teamId: string): TeamCollaborator[] {
  return teamsById.get(teamId)?.collaborators ?? [];
}

export function addTeamCollaborator(
  teamId: string,
  uid: string,
  userEmail: string,
  email: string,
): TeamCollaborator {
  const team = teamsById.get(teamId);
  if (!team) throw new NotFoundError("Équipe introuvable");
  if (!canManageTeam(team, uid, userEmail)) throw new ForbiddenError("Non autorisé");

  assertValidRosterEmail(email, "Email");
  const normalised = email.trim().toLowerCase();

  if (!Array.isArray(team.collaborators)) team.collaborators = [];

  const existing = team.collaborators.find((c) => c.email === normalised);
  if (existing) return existing;

  if (team.members.some((m) => m.email === normalised) || team.ownerUid === findUidByEmailSafe(normalised)) {
    throw new ValidationError("Cet utilisateur est déjà membre siège de l'équipe");
  }

  const entry: TeamCollaborator = { email: normalised, status: "pending" };
  team.collaborators.push(entry);
  persistTeams();
  return entry;
}

export function removeTeamCollaborator(
  teamId: string,
  uid: string,
  userEmail: string,
  email: string,
): void {
  const team = teamsById.get(teamId);
  if (!team) throw new NotFoundError("Équipe introuvable");
  if (!canManageTeam(team, uid, userEmail)) throw new ForbiddenError("Non autorisé");

  const normalised = email.trim().toLowerCase();
  if (!Array.isArray(team.collaborators)) throw new NotFoundError("Collaborateur introuvable");
  const idx = team.collaborators.findIndex((c) => c.email === normalised);
  if (idx === -1) throw new NotFoundError("Collaborateur introuvable");
  team.collaborators.splice(idx, 1);
  persistTeams();
}

function findUidByEmailSafe(email: string): string | null {
  const store = getStore();
  const users = (store.users ?? {}) as Record<string, Record<string, unknown>>;
  for (const [uid, u] of Object.entries(users)) {
    if ((u.email as string)?.toLowerCase() === email) return uid;
  }
  return null;
}

// ── Team Billing (Stripe sync) ──

export function patchTeamBilling(
  teamId: string,
  patch: {
    billingPlan?: BillingPlan;
    seatCount?: number;
    stripeSubscriptionId?: string | null;
  },
): void {
  const team = teamsById.get(teamId);
  if (!team) {
    console.warn("[teams] patchTeamBilling: équipe introuvable %s", teamId);
    return;
  }
  if (patch.billingPlan !== undefined) team.billingPlan = patch.billingPlan;
  if (patch.seatCount !== undefined) team.seatCount = patch.seatCount > 0 ? patch.seatCount : undefined;
  if (patch.stripeSubscriptionId !== undefined) {
    team.stripeSubscriptionId = patch.stripeSubscriptionId ?? undefined;
  }
  persistTeams();
}

/**
 * Trouve l'équipe liée à un Stripe Subscription id.
 * Utilisé par le webhook Stripe pour mettre à jour le plan de l'équipe.
 */
export function findTeamByStripeSubscriptionId(subId: string): Team | null {
  for (const team of teamsById.values()) {
    if (team.stripeSubscriptionId === subId) return team;
  }
  return null;
}

// ── Effective Entitlements (plan perso + couverture équipe) ──

/**
 * Droits effectifs d'un utilisateur : max entre son plan personnel et le meilleur plan
 * des équipes dont il est membre siège (owner ou membre dans `members[]`).
 * À utiliser dans les controllers pour le gating des features.
 */
export function getEffectiveEntitlementsForUid(uid: string, userEmail: string): Entitlements {
  const personal = getEntitlementsForUid(uid);
  const email = userEmail.trim().toLowerCase();
  let best: BillingPlan | null = null;

  for (const team of teamsById.values()) {
    const isMember =
      team.ownerUid === uid ||
      team.members.some((m) => m.email === email);
    if (!isMember) continue;
    const plan = team.billingPlan ?? "free";
    if (plan === "large") { best = "large"; break; }
    if (plan === "small") best = "small";
  }

  return resolveEffectiveEntitlements(personal, best);
}

/** Only owner or admin can delete the team. */
export function deleteTeam(teamId: string, uid: string, userEmail: string): void {
  const team = teamsById.get(teamId);
  if (!team) throw new NotFoundError("Équipe introuvable");
  if (!canManageTeam(team, uid, userEmail)) {
    throw new ForbiddenError("Seuls les admins peuvent supprimer l'équipe");
  }

  teamsById.delete(teamId);
  persistTeams();
}
