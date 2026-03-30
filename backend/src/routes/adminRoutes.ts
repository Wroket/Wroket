import { Router } from "express";

import { adminStats, adminUsers, adminInviteLog } from "../controllers/adminController";
import { requireAuth } from "../middlewares/requireAuth";

const adminRoutes = Router();

adminRoutes.use(requireAuth);
adminRoutes.get("/stats", adminStats);
adminRoutes.get("/users", adminUsers);
adminRoutes.get("/invites", adminInviteLog);

export default adminRoutes;
