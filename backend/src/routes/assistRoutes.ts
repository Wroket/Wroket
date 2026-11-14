import { Router } from "express";

import {
  getCommitteePreview,
  getPlanWeekPreview,
  getRisksPreview,
  postCommitteeApply,
  postPlanWeekApply,
} from "../controllers/assistController";
import { requireAuth } from "../middlewares/requireAuth";
import { noStoreCache } from "../middlewares/noStoreCache";

const router = Router();
router.use(requireAuth);
router.use(noStoreCache);

router.get("/committee", getCommitteePreview);
router.post("/committee/apply", postCommitteeApply);
router.get("/plan-week", getPlanWeekPreview);
router.post("/plan-week/apply", postPlanWeekApply);
router.get("/risks", getRisksPreview);

export default router;
