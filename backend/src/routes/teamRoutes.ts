import { Router } from "express";

import {
  getCollaborators,
  inviteCollaborator,
  deleteCollaborator,
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
teamRoutes.post("/collaborators", inviteCollaborator);
teamRoutes.delete("/collaborators/:email", deleteCollaborator);

teamRoutes.get("/", getTeams);
teamRoutes.post("/", postCreateTeam);
teamRoutes.post("/:teamId/members", postAddMember);
teamRoutes.delete("/:teamId/members/:email", postRemoveMember);
teamRoutes.delete("/:teamId", postDeleteTeam);

export default teamRoutes;
