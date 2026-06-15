import { Router } from "express";

import { requireAuth } from "../middlewares/requireAuth";
import multer from "multer";

import {
  list,
  get,
  getAccess,
  putAccess,
  create,
  update,
  remove,
  reorder,
  getTodos,
  getAllTodos,
  createPhase,
  patchPhase,
  removePhase,
  convertPhaseToSubproject,
  convertSubprojectToPhase,
  exportProject,
  importProjectTasks,
  getSteering,
  exportSteering,
} from "../controllers/projectController";
import {
  createProjectShareLinkHandler,
  listProjectShareLinks,
  revokeProjectShareLinkHandler,
} from "../controllers/projectShareController";
import {
  createCustomFieldDef,
  createMilestone,
  getProjectNotes,
  listCustomFieldDefs,
  listMilestones,
  patchCustomFieldDef,
  patchMilestone,
  removeCustomFieldDef,
  removeMilestone,
} from "../controllers/projectExtrasController";
import { uploadMiddleware, preview, confirm } from "../controllers/importController";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const router = Router();

// CSV import routes (before /:id to avoid param conflicts)
router.post("/import/preview", requireAuth, uploadMiddleware, preview);
router.post("/import/confirm", requireAuth, uploadMiddleware, confirm);

router.get("/", requireAuth, list);
router.post("/", requireAuth, create);
router.put("/reorder", requireAuth, reorder);
router.get("/all-todos", requireAuth, getAllTodos);
router.get("/:id/access", requireAuth, getAccess);
router.put("/:id/access", requireAuth, putAccess);
router.get("/:id/export", requireAuth, exportProject);
router.get("/:id/steering", requireAuth, getSteering);
router.get("/:id/steering/export", requireAuth, exportSteering);
router.get("/:id/share-links", requireAuth, listProjectShareLinks);
router.post("/:id/share-links", requireAuth, createProjectShareLinkHandler);
router.delete("/:id/share-links/:linkId", requireAuth, revokeProjectShareLinkHandler);
router.get("/:id/milestones", requireAuth, listMilestones);
router.post("/:id/milestones", requireAuth, createMilestone);
router.put("/:id/milestones/:milestoneId", requireAuth, patchMilestone);
router.delete("/:id/milestones/:milestoneId", requireAuth, removeMilestone);
router.get("/:id/custom-field-defs", requireAuth, listCustomFieldDefs);
router.post("/:id/custom-field-defs", requireAuth, createCustomFieldDef);
router.put("/:id/custom-field-defs/:fieldId", requireAuth, patchCustomFieldDef);
router.delete("/:id/custom-field-defs/:fieldId", requireAuth, removeCustomFieldDef);
router.get("/:id/notes", requireAuth, getProjectNotes);
router.post("/:id/import", requireAuth, upload.single("file"), importProjectTasks);
router.get("/:id", requireAuth, get);
router.put("/:id", requireAuth, update);
router.delete("/:id", requireAuth, remove);
router.get("/:id/todos", requireAuth, getTodos);

router.post("/:id/phases", requireAuth, createPhase);
router.post("/:id/phases/:phaseId/convert-to-subproject", requireAuth, convertPhaseToSubproject);
router.post("/:id/subprojects/:subId/convert-to-phase", requireAuth, convertSubprojectToPhase);
router.put("/:id/phases/:phaseId", requireAuth, patchPhase);
router.delete("/:id/phases/:phaseId", requireAuth, removePhase);

export default router;
