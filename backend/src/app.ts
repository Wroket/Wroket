import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { errorHandler } from "./middlewares/errorHandler";
import healthRoutes from "./routes/healthRoutes";
import authRoutes from "./routes/authRoutes";
import todoRoutes from "./routes/todoRoutes";
import notificationRoutes from "./routes/notificationRoutes";
import teamRoutes from "./routes/teamRoutes";
import projectRoutes from "./routes/projectRoutes";
import calendarRoutes from "./routes/calendarRoutes";
import webhookRoutes from "./routes/webhookRoutes";

dotenv.config();

const app = express();

app.use(helmet());

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000,http://localhost:3002")
  .split(",")
  .map((o) => o.trim());

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Origin not allowed by CORS"));
      }
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "16kb" }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de requêtes, réessayez dans une minute" },
});

app.use("/", healthRoutes);
app.use("/auth", authRoutes);
app.use("/todos", apiLimiter, todoRoutes);
app.use("/notifications", apiLimiter, notificationRoutes);
app.use("/teams", apiLimiter, teamRoutes);
app.use("/projects", apiLimiter, projectRoutes);
app.use("/calendar", apiLimiter, calendarRoutes);
app.use("/webhooks", apiLimiter, webhookRoutes);

app.use(errorHandler);

export default app;
