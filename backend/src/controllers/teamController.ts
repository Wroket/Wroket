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
  createTeam,
  addTeamMember,
  removeTeamMember,
  deleteTeam,
  updateMemberRole,
  getTeam,
  getTeamRole,
} from "../services/teamService";
import { createNotification } from "../services/notificationService";
import { findUserByEmail } from "../services/authService";
import { ValidationError } from "../utils/errors";

// ── Collaborators ──

export async function getCollaborators(req: AuthenticatedRequest, res: Response) {
  const list = listCollaborators(req.user!.uid);
  res.status(200).json(list);
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

  try {
    const targetUser = findUserByEmail(email);
    if (targetUser) {
      createNotification(
        targetUser.uid,
        "team_invite",
        "Invitation",
        `${req.user!.email} vous a invité à collaborer`,
        { inviterEmail: req.user!.email }
      );
    }
  } catch (err) {
    console.warn("[team.inviteCollaborator] notification failed:", err);
  }

  res.status(201).json(collab);
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
    createNotification(
      inviter.uid,
      "task_accepted",
      "Collaboration acceptée",
      `${req.user!.email} a accepté votre invitation à collaborer`,
      { acceptedByEmail: req.user!.email }
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
      { declinedByEmail: req.user!.email }
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
          { teamId: team.id, teamName: team.name }
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
        { teamId: team.id, teamName: team.name }
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
  if (role !== "admin" && role !== "member") throw new ValidationError("Rôle invalide (admin ou member)");

  const team = updateMemberRole(teamId, req.user!.uid, email, role);
  res.status(200).json(team);
}

export async function getMyTeamRole(req: AuthenticatedRequest, res: Response) {
  const teamId = req.params.teamId as string;
  const team = getTeam(teamId);
  if (!team) throw new ValidationError("Équipe introuvable");

  const role = getTeamRole(team, req.user!.uid, req.user!.email);
  res.status(200).json({ role });
}

export async function postDeleteTeam(req: AuthenticatedRequest, res: Response) {
  const teamId = req.params.teamId as string;
  deleteTeam(teamId, req.user!.uid);
  res.status(200).json({ ok: true });
}
