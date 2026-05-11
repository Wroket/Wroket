import { Router } from "express";

import { postCreateBillingPortalSession } from "../controllers/stripeBillingController";
import { requireAuth } from "../middlewares/requireAuth";

const billingRoutes = Router();

billingRoutes.use(requireAuth);
billingRoutes.post("/create-portal-session", postCreateBillingPortalSession);

export default billingRoutes;
