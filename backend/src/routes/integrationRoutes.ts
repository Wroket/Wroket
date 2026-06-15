import { Router } from "express";

import { requireAuth } from "../middlewares/requireAuth";
import {
  confirmNotionSync,
  confirmNotionContactsSync,
  confirmNotionDataSync,
  confirmMondaySync,
  confirmMondayDataSync,
  disconnectNotion,
  disconnectMonday,
  listConnections,
  listNotionDatabasesHandler,
  listMondayBoardsHandler,
  listMondaySourcesHandler,
  notionCallback,
  notionConnect,
  mondayCallback,
  mondayConnect,
  previewNotionSync,
  previewNotionContactsSync,
  previewNotionDataSync,
  previewMondaySync,
  previewMondayDataSync,
  listMondayDocsHandler,
  previewMondayDocsSync,
  confirmMondayDocsSync,
} from "../controllers/integrationsController";

const router = Router();

/** Source-agnostic connections hub (Notion, Monday, …). */
router.get("/connections", requireAuth, listConnections);

/** Notion OAuth — connect redirects to Notion; callback is public (state HMAC). */
router.get("/notion/connect", requireAuth, notionConnect);
router.get("/notion/callback", notionCallback);

router.get("/notion/databases", requireAuth, listNotionDatabasesHandler);
router.post("/notion/preview-sync", requireAuth, previewNotionSync);
router.post("/notion/confirm-sync", requireAuth, confirmNotionSync);
router.post("/notion/preview-contacts-sync", requireAuth, previewNotionContactsSync);
router.post("/notion/confirm-contacts-sync", requireAuth, confirmNotionContactsSync);
router.post("/notion/preview-data-sync", requireAuth, previewNotionDataSync);
router.post("/notion/confirm-data-sync", requireAuth, confirmNotionDataSync);
router.delete("/notion/connection", requireAuth, disconnectNotion);

/** Monday OAuth */
router.get("/monday/connect", requireAuth, mondayConnect);
router.get("/monday/callback", mondayCallback);
router.get("/monday/boards", requireAuth, listMondayBoardsHandler);
router.get("/monday/sources", requireAuth, listMondaySourcesHandler);
router.post("/monday/preview-sync", requireAuth, previewMondaySync);
router.post("/monday/confirm-sync", requireAuth, confirmMondaySync);
router.post("/monday/preview-data-sync", requireAuth, previewMondayDataSync);
router.post("/monday/confirm-data-sync", requireAuth, confirmMondayDataSync);
router.delete("/monday/connection", requireAuth, disconnectMonday);

/** Monday Docs → Wroket Documents */
router.get("/monday/docs", requireAuth, listMondayDocsHandler);
router.post("/monday/docs/preview-sync", requireAuth, previewMondayDocsSync);
router.post("/monday/docs/confirm-sync", requireAuth, confirmMondayDocsSync);

export default router;
