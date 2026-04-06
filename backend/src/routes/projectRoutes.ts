import { Router } from "express";

import { requireAuth } from "../middlewares/requireAuth";
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
} from "../controllers/projectController";
import { uploadMiddleware, preview, confirm } from "../controllers/importController";

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
router.get("/:id", requireAuth, get);
router.put("/:id", requireAuth, update);
router.delete("/:id", requireAuth, remove);
router.get("/:id/todos", requireAuth, getTodos);

router.post("/:id/phases", requireAuth, createPhase);
router.put("/:id/phases/:phaseId", requireAuth, patchPhase);
router.delete("/:id/phases/:phaseId", requireAuth, removePhase);

export default router;
