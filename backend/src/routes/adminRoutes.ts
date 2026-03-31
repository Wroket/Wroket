import { Router } from "express";

import { adminStats, adminUsers, adminInviteLog } from "../controllers/adminController";
import { requireAuth } from "../middlewares/requireAuth";
import { requireAdmin } from "../middlewares/requireAdmin";

const adminRoutes = Router();

// FIX: Apply requireAdmin at the router level for defense-in-depth.
// Even if a developer adds a new admin endpoint and forgets to call
// isAdmin() in the controller, the middleware will block non-admins.
adminRoutes.use(requireAuth);
adminRoutes.use(requireAdmin);
adminRoutes.get("/stats", adminStats);
adminRoutes.get("/users", adminUsers);
adminRoutes.get("/invites", adminInviteLog);

export default adminRoutes;
