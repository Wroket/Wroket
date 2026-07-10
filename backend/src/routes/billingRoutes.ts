import { Router } from "express";

import { postCreateBillingPortalSession, postCreateTeamBillingPortalSession } from "../controllers/stripeBillingController";
import { requireAuth } from "../middlewares/requireAuth";

const billingRoutes = Router();

billingRoutes.use(requireAuth);
billingRoutes.post("/create-portal-session", postCreateBillingPortalSession);
billingRoutes.post("/team-portal-session", postCreateTeamBillingPortalSession);

export default billingRoutes;
