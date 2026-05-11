import compression from "compression";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { errorHandler } from "./middlewares/errorHandler";
import { noStoreCache } from "./middlewares/noStoreCache";
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
import { postStripeWebhook } from "./controllers/stripeBillingController";
import billingRoutes from "./routes/billingRoutes";

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

app.use(express.json({ limit: "128kb" }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
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
app.use("/auth", authRoutes);
app.use("/todos", apiLimiter, todoRoutes);
app.use("/notifications", apiLimiter, notificationRoutes);
app.use("/teams", apiLimiter, teamRoutes);
app.use("/projects", apiLimiter, projectRoutes);
app.use("/calendar", apiLimiter, calendarRoutes);
app.use("/webhooks", apiLimiter, webhookRoutes);
app.use("/admin", apiLimiter, adminRoutes);
app.use("/notes", apiLimiter, noteRoutes);
app.use("/attachments", apiLimiter, attachmentRoutes);
/** SSE spike: long-lived connections — not counted by per-minute REST limiter. */
app.use("/sync", syncEventsRoutes);

app.use(errorHandler);

export default app;
