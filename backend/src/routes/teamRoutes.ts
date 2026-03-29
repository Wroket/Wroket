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
teamRoutes.post("/:teamId/members", postAddMember);
teamRoutes.delete("/:teamId/members/:email", postRemoveMember);
teamRoutes.delete("/:teamId", postDeleteTeam);

export default teamRoutes;
