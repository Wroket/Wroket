import { Router } from "express";

import {
  getCollaborators,
  getEmailSuggestions,
  getReceivedInvitations,
  inviteCollaborator,
  postResendCollaborationInvite,
  deleteCollaborator,
  postAcceptCollaboration,
  postDeclineCollaboration,
  getTeams,
  getOwnedTeams,
  postCreateTeam,
  postAddMember,
  postRemoveMember,
  postDeleteTeam,
  postUpdateMemberRole,
  postTransferOwnership,
  getMyTeamRole,
  getTeamDashboard,
  getTeamReporting,
  getTeamCollaborators,
  postAddTeamCollaborator,
  deleteTeamCollaborator,
} from "../controllers/teamController";
import { requireAuth } from "../middlewares/requireAuth";

const teamRoutes = Router();

teamRoutes.use(requireAuth);

teamRoutes.get("/collaborators", getCollaborators);
teamRoutes.get("/email-suggestions", getEmailSuggestions);
teamRoutes.get("/collaborators/received", getReceivedInvitations);
teamRoutes.post("/collaborators", inviteCollaborator);
teamRoutes.post("/collaborators/resend", postResendCollaborationInvite);
teamRoutes.delete("/collaborators/:email", deleteCollaborator);
teamRoutes.post("/collaborators/accept", postAcceptCollaboration);
teamRoutes.post("/collaborators/decline", postDeclineCollaboration);

teamRoutes.get("/", getTeams);
teamRoutes.get("/owned", getOwnedTeams);
teamRoutes.post("/", postCreateTeam);
teamRoutes.get("/:teamId/role", getMyTeamRole);
teamRoutes.get("/:teamId/dashboard", getTeamDashboard);
teamRoutes.get("/:teamId/reporting", getTeamReporting);
teamRoutes.post("/:teamId/members", postAddMember);
teamRoutes.patch("/:teamId/members/role", postUpdateMemberRole);
teamRoutes.delete("/:teamId/members/:email", postRemoveMember);
teamRoutes.get("/:teamId/ext-collaborators", getTeamCollaborators);
teamRoutes.post("/:teamId/ext-collaborators", postAddTeamCollaborator);
teamRoutes.delete("/:teamId/ext-collaborators/:email", deleteTeamCollaborator);
teamRoutes.post("/:teamId/transfer", postTransferOwnership);
teamRoutes.delete("/:teamId", postDeleteTeam);

export default teamRoutes;
