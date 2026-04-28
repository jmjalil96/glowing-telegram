import type { NextFunction, Request, Response } from "express";

import { AppError } from "../http/app-error.js";

export const notFoundMiddleware = (
  _req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  next(new AppError(404, "NOT_FOUND", "Route not found"));
};
