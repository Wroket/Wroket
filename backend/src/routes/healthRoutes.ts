import { Router } from "express";

import { getHealth, getReady, getRoot } from "../controllers/healthController";

const healthRoutes = Router();

healthRoutes.get("/", getRoot);
healthRoutes.get("/health", getHealth);
healthRoutes.get("/health/ready", getReady);

export default healthRoutes;

