import { Router } from "express";

import {
  getSlots, bookSlot, clearSlot,
  googleAuthUrl, googleCallback, disconnectGoogle, getCalendarEvents,
  listCalendars, saveCalendarSelection,
  createMeet, clearMeet,
} from "../controllers/calendarController";
import { requireAuth } from "../middlewares/requireAuth";

const calendarRoutes = Router();

calendarRoutes.get("/google/callback", googleCallback);

calendarRoutes.use(requireAuth);
calendarRoutes.get("/slots/:todoId", getSlots);
calendarRoutes.post("/book/:todoId", bookSlot);
calendarRoutes.delete("/slot/:todoId", clearSlot);
calendarRoutes.get("/google/auth-url", googleAuthUrl);
calendarRoutes.delete("/google/disconnect", disconnectGoogle);
calendarRoutes.delete("/google/disconnect/:accountId", disconnectGoogle);
calendarRoutes.get("/google/accounts/:accountId/calendars", listCalendars);
calendarRoutes.put("/google/accounts/:accountId/calendars", saveCalendarSelection);
calendarRoutes.get("/events", getCalendarEvents);
calendarRoutes.post("/meet/:todoId", createMeet);
calendarRoutes.delete("/meet/:todoId", clearMeet);

export default calendarRoutes;
