import cors from "cors";
import dotenv from "dotenv";
import express from "express";

import { errorHandler } from "./middlewares/errorHandler";
import healthRoutes from "./routes/healthRoutes";
import authRoutes from "./routes/authRoutes";

dotenv.config();

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true
  })
);
app.use(express.json());

app.use("/", healthRoutes);
app.use("/auth", authRoutes);

app.use(errorHandler);

export default app;

