import { Router } from "express";

import {
  adminStats,
  adminUsers,
  adminInviteLog,
  adminActivity,
  adminSessions,
  adminIntegrations,
  adminUserExport,
  adminUserDelete,
  adminUserBillingPortalSession,
  adminUserBillingPlanPatch,
  adminCompletionRates,
} from "../controllers/adminController";
import { requireAuth } from "../middlewares/requireAuth";
import { requireAdmin } from "../middlewares/requireAdmin";

const adminRoutes = Router();

adminRoutes.use(requireAuth);
adminRoutes.use(requireAdmin);

adminRoutes.get("/stats", adminStats);
adminRoutes.get("/users", adminUsers);
adminRoutes.get("/users/completion-rates", adminCompletionRates);
adminRoutes.get("/users/:uid/export", adminUserExport);
adminRoutes.post("/users/:uid/billing-portal-session", adminUserBillingPortalSession);
adminRoutes.patch("/users/:uid/billing-plan", adminUserBillingPlanPatch);
adminRoutes.delete("/users/:uid", adminUserDelete);
adminRoutes.get("/invites", adminInviteLog);
adminRoutes.get("/activity", adminActivity);
adminRoutes.get("/sessions", adminSessions);
adminRoutes.get("/integrations", adminIntegrations);

export default adminRoutes;
