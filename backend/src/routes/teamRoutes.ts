import { Router } from "express";

import {
  getCollaborators,
  getReceivedInvitations,
  inviteCollaborator,
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
} from "../controllers/teamController";
import { requireAuth } from "../middlewares/requireAuth";

const teamRoutes = Router();

teamRoutes.use(requireAuth);

teamRoutes.get("/collaborators", getCollaborators);
teamRoutes.get("/collaborators/received", getReceivedInvitations);
teamRoutes.post("/collaborators", inviteCollaborator);
teamRoutes.delete("/collaborators/:email", deleteCollaborator);
teamRoutes.post("/collaborators/accept", postAcceptCollaboration);
teamRoutes.post("/collaborators/decline", postDeclineCollaboration);

teamRoutes.get("/", getTeams);
teamRoutes.get("/owned", getOwnedTeams);
teamRoutes.post("/", postCreateTeam);
teamRoutes.get("/:teamId/role", getMyTeamRole);
teamRoutes.get("/:teamId/dashboard", getTeamDashboard);
teamRoutes.post("/:teamId/members", postAddMember);
teamRoutes.patch("/:teamId/members/role", postUpdateMemberRole);
teamRoutes.delete("/:teamId/members/:email", postRemoveMember);
teamRoutes.post("/:teamId/transfer", postTransferOwnership);
teamRoutes.delete("/:teamId", postDeleteTeam);

export default teamRoutes;
