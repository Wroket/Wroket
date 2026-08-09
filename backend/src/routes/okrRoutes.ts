import { Router } from "express";

import {
  createOkrHandler,
  deleteOkrHandler,
  listOkrs,
  refreshOkrHandler,
  updateOkrHandler,
} from "../controllers/okrController";
import { requireAuth } from "../middlewares/requireAuth";
import { noStoreCache } from "../middlewares/noStoreCache";

const router = Router();
router.use(requireAuth);
router.use(noStoreCache);

router.get("/", listOkrs);
router.post("/", createOkrHandler);
router.put("/:id", updateOkrHandler);
router.post("/:id/refresh", refreshOkrHandler);
router.delete("/:id", deleteOkrHandler);

export default router;
