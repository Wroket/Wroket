import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";

import { errorHandler } from "./middlewares/errorHandler";
import healthRoutes from "./routes/healthRoutes";
import authRoutes from "./routes/authRoutes";
import todoRoutes from "./routes/todoRoutes";
import notificationRoutes from "./routes/notificationRoutes";
import teamRoutes from "./routes/teamRoutes";

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

app.use("/", healthRoutes);
app.use("/auth", authRoutes);
app.use("/todos", todoRoutes);
app.use("/notifications", notificationRoutes);
app.use("/teams", teamRoutes);

app.use(errorHandler);

export default app;

