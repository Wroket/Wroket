import { Router } from "express";

import { getHealth, getRoot } from "../controllers/healthController";

const healthRoutes = Router();

healthRoutes.get("/", getRoot);
healthRoutes.get("/health", getHealth);

export default healthRoutes;

