import { Router } from "express";

import { requireAuth } from "../middlewares/requireAuth";
import { noStoreCache } from "../middlewares/noStoreCache";
import * as ctrl from "../controllers/userDatabaseController";

const router = Router();

router.use(requireAuth);
router.use(noStoreCache);

router.get("/archived", ctrl.listArchived);
router.post("/archived/:id/restore", ctrl.restoreArchived);
router.delete("/archived/:id", ctrl.purgeArchived);
router.get("/shared", ctrl.listShared);
router.get("/", ctrl.list);
router.post("/", ctrl.create);
router.get("/:id/live", ctrl.getLive);
router.post("/:id/presence", ctrl.postPresence);
router.get("/:id/revisions", ctrl.listRevisions);
router.post("/:id/revisions/:revId/restore", ctrl.restoreRevision);
router.get("/:id", ctrl.getOne);
router.patch("/:id", ctrl.update);
router.delete("/:id", ctrl.remove);
router.get("/:id/rows", ctrl.listRows);
router.post("/:id/rows", ctrl.createRow);
router.patch("/:id/rows/:rowId", ctrl.updateRow);
router.delete("/:id/rows/:rowId", ctrl.removeRow);

export default router;
