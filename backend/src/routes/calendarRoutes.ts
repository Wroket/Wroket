import { Router } from "express";

import {
  getSlots, bookSlot, clearSlot,
  googleAuthUrl, googleCallback, disconnectGoogle, getCalendarEvents,
  listCalendars, saveCalendarSelection,
  microsoftCalendarAuthUrl, microsoftCalendarCallback, disconnectMicrosoft,
  listMicrosoftCalendars, saveMicrosoftCalendarSelection,
  createMeet, updateMeet, clearMeet,
} from "../controllers/calendarController";
import { requireAuth } from "../middlewares/requireAuth";

const calendarRoutes = Router();

calendarRoutes.get("/google/callback", googleCallback);
calendarRoutes.get("/microsoft/callback", microsoftCalendarCallback);

calendarRoutes.use(requireAuth);
calendarRoutes.get("/slots/:todoId", getSlots);
calendarRoutes.post("/book/:todoId", bookSlot);
calendarRoutes.delete("/slot/:todoId", clearSlot);
calendarRoutes.get("/google/auth-url", googleAuthUrl);
calendarRoutes.get("/microsoft/auth-url", microsoftCalendarAuthUrl);
calendarRoutes.delete("/google/disconnect", disconnectGoogle);
calendarRoutes.delete("/google/disconnect/:accountId", disconnectGoogle);
calendarRoutes.delete("/microsoft/disconnect", disconnectMicrosoft);
calendarRoutes.delete("/microsoft/disconnect/:accountId", disconnectMicrosoft);
calendarRoutes.get("/google/accounts/:accountId/calendars", listCalendars);
calendarRoutes.put("/google/accounts/:accountId/calendars", saveCalendarSelection);
calendarRoutes.get("/microsoft/accounts/:accountId/calendars", listMicrosoftCalendars);
calendarRoutes.put("/microsoft/accounts/:accountId/calendars", saveMicrosoftCalendarSelection);
calendarRoutes.get("/events", getCalendarEvents);
calendarRoutes.post("/meet/:todoId", createMeet);
calendarRoutes.patch("/meet/:todoId", updateMeet);
calendarRoutes.delete("/meet/:todoId", clearMeet);

export default calendarRoutes;
