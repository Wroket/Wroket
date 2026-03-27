import { Response } from "express";

import { AuthenticatedRequest } from "./authController";
import {
  listCollaborators,
  addCollaborator,
  removeCollaborator,
  listUserTeams,
  createTeam,
  addTeamMember,
  removeTeamMember,
  deleteTeam,
} from "../services/teamService";
import { createNotification } from "../services/notificationService";
import { findUserByEmail } from "../services/authService";

// ── Collaborators ──

export async function getCollaborators(req: AuthenticatedRequest, res: Response) {
  try {
    const list = listCollaborators(req.user!.uid);
    res.status(200).json(list);
  } catch (err) {
    console.error("[team.getCollaborators]", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
}

export async function inviteCollaborator(req: AuthenticatedRequest, res: Response) {
  try {
    const { email } = req.body as { email?: string };
    if (!email || typeof email !== "string") {
      res.status(400).json({ message: "Email requis" });
      return;
    }

    const collab = addCollaborator(req.user!.uid, email);

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

    res.status(201).json(collab);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    res.status(400).json({ message });
  }
}

export async function deleteCollaborator(req: AuthenticatedRequest, res: Response) {
  try {
    const { email } = req.params;
    removeCollaborator(req.user!.uid, decodeURIComponent(email));
    res.status(200).json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    res.status(404).json({ message });
  }
}

// ── Teams ──

export async function getTeams(req: AuthenticatedRequest, res: Response) {
  try {
    const teams = listUserTeams(req.user!.uid, req.user!.email);
    res.status(200).json(teams);
  } catch (err) {
    console.error("[team.getTeams]", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
}

export async function postCreateTeam(req: AuthenticatedRequest, res: Response) {
  try {
    const { name, members } = req.body as { name?: string; members?: string[] };
    if (!name || typeof name !== "string") {
      res.status(400).json({ message: "Nom requis" });
      return;
    }

    const memberEmails = Array.isArray(members) ? members : [];
    const team = createTeam(req.user!.uid, name, memberEmails);

    for (const m of team.members) {
      const collab = addCollaborator(req.user!.uid, m.email);
      void collab;

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

    res.status(201).json(team);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    res.status(400).json({ message });
  }
}

export async function postAddMember(req: AuthenticatedRequest, res: Response) {
  try {
    const { teamId } = req.params;
    const { email } = req.body as { email?: string };
    if (!email || typeof email !== "string") {
      res.status(400).json({ message: "Email requis" });
      return;
    }

    const team = addTeamMember(teamId, req.user!.uid, email);

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

    res.status(200).json(team);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const status = message.includes("introuvable") ? 404 : 400;
    res.status(status).json({ message });
  }
}

export async function postRemoveMember(req: AuthenticatedRequest, res: Response) {
  try {
    const { teamId, email } = req.params;
    const team = removeTeamMember(teamId, req.user!.uid, decodeURIComponent(email));
    res.status(200).json(team);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const status = message.includes("introuvable") ? 404 : 400;
    res.status(status).json({ message });
  }
}

export async function postDeleteTeam(req: AuthenticatedRequest, res: Response) {
  try {
    const { teamId } = req.params;
    deleteTeam(teamId, req.user!.uid);
    res.status(200).json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const status = message.includes("introuvable") ? 404 : 400;
    res.status(status).json({ message });
  }
}
