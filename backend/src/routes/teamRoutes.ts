import { Router } from "express";

import {
  getCollaborators,
  getReceivedInvitations,
  inviteCollaborator,
  deleteCollaborator,
  postAcceptCollaboration,
  postDeclineCollaboration,
  getTeams,
  postCreateTeam,
  postAddMember,
  postRemoveMember,
  postDeleteTeam,
  postUpdateMemberRole,
  getMyTeamRole,
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
teamRoutes.post("/", postCreateTeam);
teamRoutes.get("/:teamId/role", getMyTeamRole);
teamRoutes.post("/:teamId/members", postAddMember);
teamRoutes.patch("/:teamId/members/role", postUpdateMemberRole);
teamRoutes.delete("/:teamId/members/:email", postRemoveMember);
teamRoutes.delete("/:teamId", postDeleteTeam);

export default teamRoutes;
