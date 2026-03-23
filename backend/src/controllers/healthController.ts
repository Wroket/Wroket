import { Request, Response } from "express";

import { getHealthStatus } from "../services/healthService";

export const getRoot = (_req: Request, res: Response): void => {
  res.status(200).json({ message: "Wroket backend is running" });
};

export const getHealth = (_req: Request, res: Response): void => {
  res.status(200).json(getHealthStatus());
};

