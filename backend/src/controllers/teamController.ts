import { Response } from "express";

import { AuthenticatedRequest } from "./authController";
import {
  listCollaborators,
  listReceivedInvitations,
  addCollaborator,
  removeCollaborator,
  acceptCollaboration,
  declineCollaboration,
  listUserTeams,
  listOwnedTeams,
  transferTeamOwnership,
  createTeam,
  addTeamMember,
  removeTeamMember,
  deleteTeam,
  updateMemberRole,
  getTeam,
  getTeamRole,
  findCollaborator,
  listKnownContactEmails,
  filterContactEmailsByQuery,
} from "../services/teamService";
import { listTodosForUsers } from "../services/todoService";
import { createNotification } from "../services/notificationService";
import { findUserByEmail, findUserByUid, type AuthUser } from "../services/authService";
import { sendCollaborationInviteEmail } from "../services/emailService";
import { deliverPendingMentionsAfterCollaborationAccepted } from "../services/pendingMentionService";
import { NotFoundError, ValidationError } from "../utils/errors";

/**
 * In-app notification (if the invitee has an account) + collaboration email (best-effort).
 */
async function deliverCollaborationInvite(inviter: AuthUser, inviteeEmailNormalised: string): Promise<void> {
  const inviterEmail = inviter.email;
  const fromName = [inviter.firstName, inviter.lastName].filter(Boolean).join(" ") || inviterEmail;
  try {
    const targetUser = findUserByEmail(inviteeEmailNormalised);
    if (targetUser) {
      createNotification(
        targetUser.uid,
        "team_invite",
        "Invitation",
        `${inviterEmail} vous a invité à collaborer`,
        { inviterEmail, actorEmail: inviterEmail },
      );
    }
  } catch (err) {
    console.warn("[team] collaboration in-app notification failed:", err);
  }
  await sendCollaborationInviteEmail(inviteeEmailNormalised, inviterEmail, fromName);
}

// ── Collaborators ──

export async function getCollaborators(req: AuthenticatedRequest, res: Response) {
  const list = listCollaborators(req.user!.uid);
  res.status(200).json(list);
}

/** Autocomplete emails (collaborators + team members) from the 3rd character. */
export async function getEmailSuggestions(req: AuthenticatedRequest, res: Response) {
  const rawQ = typeof req.query.q === "string" ? req.query.q : "";
  const q = rawQ.trim();
  if (q.length < 3) {
    res.status(200).json({ emails: [] });
    return;
  }
  if (q.length > 200) {
    throw new ValidationError("Requête trop longue");
  }
  const user = req.user!;
  const pool = listKnownContactEmails(user.uid, user.email);
  const emails = filterContactEmailsByQuery(pool, q, 3, 40);
  res.status(200).json({ emails });
}

export async function getReceivedInvitations(req: AuthenticatedRequest, res: Response) {
  const list = listReceivedInvitations(req.user!.uid, req.user!.email);
  res.status(200).json(list);
}

export async function inviteCollaborator(req: AuthenticatedRequest, res: Response) {
  const { email } = req.body as { email?: string };
  if (!email || typeof email !== "string") {
    throw new ValidationError("Email requis");
  }

  const collab = addCollaborator(req.user!.uid, email);

  if (collab.status === "pending") {
    try {
      await deliverCollaborationInvite(req.user!, collab.email);
    } catch (err) {
      console.warn("[team.inviteCollaborator] deliver failed:", err);
    }
  }

  res.status(201).json(collab);
}

/** Re-send notification + email for an existing pending collaboration invite. */
export async function postResendCollaborationInvite(req: AuthenticatedRequest, res: Response) {
  const { email } = req.body as { email?: string };
  if (!email || typeof email !== "string") {
    throw new ValidationError("Email requis");
  }
  const normalised = email.trim().toLowerCase();
  const entry = findCollaborator(req.user!.uid, normalised);
  if (!entry) {
    throw new NotFoundError("Invitation introuvable");
  }
  if (entry.status !== "pending") {
    throw new ValidationError("Seules les invitations en attente peuvent être renvoyées");
  }
  await deliverCollaborationInvite(req.user!, entry.email);
  res.status(200).json({ ok: true });
}

export async function deleteCollaborator(req: AuthenticatedRequest, res: Response) {
  const email = req.params.email as string;
  removeCollaborator(req.user!.uid, decodeURIComponent(email));
  res.status(200).json({ ok: true });
}

export async function postAcceptCollaboration(req: AuthenticatedRequest, res: Response) {
  const { inviterEmail } = req.body as { inviterEmail?: string };
  if (!inviterEmail) throw new ValidationError("inviterEmail requis");

  const inviter = findUserByEmail(inviterEmail);
  if (!inviter) throw new ValidationError("Utilisateur introuvable");

  acceptCollaboration(req.user!.uid, req.user!.email, inviter.uid, inviterEmail);

  try {
    deliverPendingMentionsAfterCollaborationAccepted(inviter.uid, req.user!.email ?? "");
  } catch (err) {
    console.warn("[team] deliver pending mention notifications failed:", err);
  }

  try {
    createNotification(
      inviter.uid,
      "task_accepted",
      "Collaboration acceptée",
      `${req.user!.email} a accepté votre invitation à collaborer`,
      { acceptedByEmail: req.user!.email ?? "", actorEmail: req.user!.email ?? "" }
    );
  } catch { /* ignore */ }

  res.status(200).json({ ok: true });
}

export async function postDeclineCollaboration(req: AuthenticatedRequest, res: Response) {
  const { inviterEmail } = req.body as { inviterEmail?: string };
  if (!inviterEmail) throw new ValidationError("inviterEmail requis");

  const inviter = findUserByEmail(inviterEmail);
  if (!inviter) throw new ValidationError("Utilisateur introuvable");

  declineCollaboration(inviter.uid, req.user!.email);

  try {
    createNotification(
      inviter.uid,
      "task_declined",
      "Collaboration refusée",
      `${req.user!.email} a décliné votre invitation à collaborer`,
      { declinedByEmail: req.user!.email ?? "", actorEmail: req.user!.email ?? "" }
    );
  } catch { /* ignore */ }

  res.status(200).json({ ok: true });
}

// ── Teams ──

export async function getTeams(req: AuthenticatedRequest, res: Response) {
  const teams = listUserTeams(req.user!.uid, req.user!.email);
  res.status(200).json(teams);
}

export async function postCreateTeam(req: AuthenticatedRequest, res: Response) {
  const { name, members } = req.body as { name?: string; members?: string[] };
  if (!name || typeof name !== "string") {
    throw new ValidationError("Nom requis");
  }

  const memberEmails = Array.isArray(members) ? members : [];
  const team = createTeam(req.user!.uid, name, memberEmails);

  try {
    for (const m of team.members) {
      addCollaborator(req.user!.uid, m.email);

      const targetUser = findUserByEmail(m.email);
      if (targetUser) {
        createNotification(
          targetUser.uid,
          "team_invite",
          "Ajouté à une équipe",
          `${req.user!.email} vous a ajouté à l'équipe "${team.name}"`,
          { teamId: team.id, teamName: team.name, actorEmail: req.user!.email ?? "" }
        );
      }
    }
  } catch (err) {
    console.warn("[team.postCreateTeam] side-effect failed:", err);
  }

  res.status(201).json(team);
}

export async function postAddMember(req: AuthenticatedRequest, res: Response) {
  const teamId = req.params.teamId as string;
  const { email } = req.body as { email?: string };
  if (!email || typeof email !== "string") {
    throw new ValidationError("Email requis");
  }

  const team = addTeamMember(teamId, req.user!.uid, req.user!.email, email);

  try {
    const targetUser = findUserByEmail(email);
    if (targetUser) {
      createNotification(
        targetUser.uid,
        "team_invite",
        "Ajouté à une équipe",
        `${req.user!.email} vous a ajouté à l'équipe "${team.name}"`,
        { teamId: team.id, teamName: team.name, actorEmail: req.user!.email ?? "" }
      );
    }
  } catch (err) {
    console.warn("[team.postAddMember] notification failed:", err);
  }

  res.status(200).json(team);
}

export async function postRemoveMember(req: AuthenticatedRequest, res: Response) {
  const teamId = req.params.teamId as string;
  const email = req.params.email as string;
  const team = removeTeamMember(teamId, req.user!.uid, req.user!.email, decodeURIComponent(email));
  res.status(200).json(team);
}

export async function postUpdateMemberRole(req: AuthenticatedRequest, res: Response) {
  const teamId = req.params.teamId as string;
  const { email, role } = req.body as { email?: string; role?: string };
  if (!email || typeof email !== "string") throw new ValidationError("Email requis");
  if (role !== "co-owner" && role !== "admin" && role !== "super-user" && role !== "user") {
    throw new ValidationError("Rôle invalide (co-owner, admin, super-user ou user)");
  }

  const team = updateMemberRole(teamId, req.user!.uid, req.user!.email, email, role);
  res.status(200).json(team);
}

export async function getMyTeamRole(req: AuthenticatedRequest, res: Response) {
  const teamId = req.params.teamId as string;
  const team = getTeam(teamId);
  if (!team) throw new ValidationError("Équipe introuvable");

  const role = getTeamRole(team, req.user!.uid, req.user!.email);
  res.status(200).json({ role });
}

export async function getTeamDashboard(req: AuthenticatedRequest, res: Response) {
  const teamId = req.params.teamId as string;
  const team = getTeam(teamId);
  if (!team) throw new ValidationError("Équipe introuvable");

  const role = getTeamRole(team, req.user!.uid, req.user!.email);
  if (!role) throw new ValidationError("Vous ne faites pas partie de cette équipe");

  const memberUids: string[] = [team.ownerUid];
  for (const m of team.members) {
    const u = findUserByEmail(m.email);
    if (u) memberUids.push(u.uid);
  }

  const todos = listTodosForUsers(memberUids);

  const ownerUser = findUserByUid(team.ownerUid);
  const memberMap: Record<string, string> = {};
  if (ownerUser) memberMap[ownerUser.uid] = ownerUser.email;
  for (const m of team.members) {
    const u = findUserByEmail(m.email);
    if (u) memberMap[u.uid] = u.email;
  }

  const stats = {
    totalTasks: todos.length,
    byMember: {} as Record<string, { total: number; overdue: number }>,
    overdue: 0,
    dueSoon: 0,
  };

  const now = new Date();
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  for (const todo of todos) {
    const email = memberMap[todo.userId] ?? todo.userId;
    if (!stats.byMember[email]) stats.byMember[email] = { total: 0, overdue: 0 };
    stats.byMember[email].total++;

    if (todo.deadline) {
      const dl = new Date(todo.deadline);
      if (dl < now) { stats.overdue++; stats.byMember[email].overdue++; }
      else if (dl <= in48h) { stats.dueSoon++; }
    }
  }

  res.status(200).json({ team, stats, todos, memberMap });
}

export async function getOwnedTeams(req: AuthenticatedRequest, res: Response) {
  const teams = listOwnedTeams(req.user!.uid);
  res.status(200).json(teams);
}

export async function postTransferOwnership(req: AuthenticatedRequest, res: Response) {
  const teamId = req.params.teamId as string;
  const { newOwnerEmail } = req.body as { newOwnerEmail?: string };
  if (!newOwnerEmail || typeof newOwnerEmail !== "string") {
    throw new ValidationError("Email du nouveau propriétaire requis");
  }
  const team = transferTeamOwnership(teamId, req.user!.uid, req.user!.email, newOwnerEmail);

  try {
    const targetUser = findUserByEmail(newOwnerEmail);
    if (targetUser) {
      createNotification(
        targetUser.uid,
        "team_invite",
        "Team ownership transferred",
        `You are now the owner of the team "${team.name}"`,
        { teamId: team.id, teamName: team.name, actorEmail: req.user!.email ?? "" },
      );
    }
  } catch { /* ignore */ }

  res.status(200).json(team);
}

export async function postDeleteTeam(req: AuthenticatedRequest, res: Response) {
  const teamId = req.params.teamId as string;
  deleteTeam(teamId, req.user!.uid, req.user!.email);
  res.status(200).json({ ok: true });
}
