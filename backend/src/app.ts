import compression from "compression";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { errorHandler } from "./middlewares/errorHandler";
import { noStoreCache } from "./middlewares/noStoreCache";
import { requireProductAccess } from "./middlewares/requireProductAccess";
import { requestId } from "./middlewares/requestId";
import healthRoutes from "./routes/healthRoutes";
import authRoutes from "./routes/authRoutes";
import todoRoutes from "./routes/todoRoutes";
import notificationRoutes from "./routes/notificationRoutes";
import teamRoutes from "./routes/teamRoutes";
import projectRoutes from "./routes/projectRoutes";
import calendarRoutes from "./routes/calendarRoutes";
import webhookRoutes from "./routes/webhookRoutes";
import adminRoutes from "./routes/adminRoutes";
import noteRoutes from "./routes/noteRoutes";
import attachmentRoutes from "./routes/attachmentRoutes";
import syncEventsRoutes from "./routes/syncEventsRoutes";
import notionImportRoutes from "./routes/notionImportRoutes";
import mondayImportRoutes from "./routes/mondayImportRoutes";
import integrationRoutes from "./routes/integrationRoutes";
import sharePublicRoutes from "./routes/sharePublicRoutes";
import { postStripeWebhook } from "./controllers/stripeBillingController";
import { postSlackInteractions, postSlackCommands } from "./controllers/slackInteractController";
import billingRoutes from "./routes/billingRoutes";
import marketingRoutes from "./routes/marketingRoutes";
import feedbackRoutes from "./routes/feedbackRoutes";
import earlyBirdRoutes from "./routes/earlyBirdRoutes";
import templateRoutes from "./routes/templateRoutes";
import pushRoutes from "./routes/pushRoutes";
import contactRoutes from "./routes/contactRoutes";
import userDatabaseRoutes from "./routes/userDatabaseRoutes";
import mcpRoutes from "./routes/mcpRoutes";

dotenv.config();

const app = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");

// Request ID first so every response (including errors from later middleware) is traceable.
app.use(requestId);

// Default CORP is `same-origin`, which blocks the browser from using cross-origin API responses
// (e.g. fetch from https://wroket.com to https://api.wroket.com). CORS alone is not enough.
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    hidePoweredBy: true,
  }),
);
app.use(compression());

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000,http://localhost:3002")
  .split(/[,;]/)
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  })
);

/** Stripe needs the raw body for signature verification — must run before `express.json`. */
app.post("/billing/stripe-webhook", express.raw({ type: "application/json" }), postStripeWebhook);

/** Slack interactivity + slash — form-urlencoded raw body for HMAC (Lot 3). */
app.post(
  "/integrations/slack/interactions",
  express.raw({ type: "*/*" }),
  (req, res, next) => {
    void postSlackInteractions(req, res).catch(next);
  },
);
app.post(
  "/integrations/slack/commands",
  express.raw({ type: "*/*" }),
  (req, res, next) => {
    void postSlackCommands(req, res).catch(next);
  },
);

app.use(express.json({ limit: "128kb" }));

// 300/min per client IP: active SPA usage (autosave + list refetch + counts) peaks well
// above 100/min for a single legitimate user; 429 storms were observed at 100.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de requêtes, réessayez dans une minute" },
});

// Prevent HTTP caches (browser, CDN, proxy) from serving stale authenticated data.
// Applied at the app level so every business route is covered, including future ones.
// Individual attachment controllers may override with their own Cache-Control headers.
app.use(noStoreCache);

app.use("/billing", apiLimiter, billingRoutes);

app.use("/", healthRoutes);
app.use("/marketing", marketingRoutes);
app.use("/feedback", apiLimiter, feedbackRoutes);
app.use("/early-bird", apiLimiter, earlyBirdRoutes);
app.use("/auth", authRoutes);
app.use("/mcp", apiLimiter, mcpRoutes);
app.use("/todos", apiLimiter, requireProductAccess, todoRoutes);
app.use("/notifications", apiLimiter, notificationRoutes);
app.use("/teams", apiLimiter, teamRoutes);
app.use("/projects", apiLimiter, requireProductAccess, projectRoutes);
app.use("/calendar", apiLimiter, requireProductAccess, calendarRoutes);
app.use("/webhooks", apiLimiter, requireProductAccess, webhookRoutes);
app.use("/admin", apiLimiter, requireProductAccess, adminRoutes);
app.use("/notes", apiLimiter, requireProductAccess, noteRoutes);
app.use("/attachments", apiLimiter, requireProductAccess, attachmentRoutes);
app.use("/templates", apiLimiter, requireProductAccess, templateRoutes);
app.use("/push", apiLimiter, pushRoutes);
app.use("/contacts", apiLimiter, requireProductAccess, contactRoutes);
app.use("/user-databases", apiLimiter, requireProductAccess, userDatabaseRoutes);
app.use("/import", requireProductAccess, notionImportRoutes);
app.use("/import", requireProductAccess, mondayImportRoutes);
app.use("/integrations", apiLimiter, requireProductAccess, integrationRoutes);
app.use("/share", sharePublicRoutes);
/** SSE spike: long-lived connections — not counted by per-minute REST limiter. */
app.use("/sync", syncEventsRoutes);

app.use(errorHandler);

export default app;
