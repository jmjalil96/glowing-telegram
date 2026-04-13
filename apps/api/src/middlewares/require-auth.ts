import type { RequestHandler } from "express";

import { AppError } from "../errors/app-error.js";

export const requireAuthMiddleware: RequestHandler = (req, _res, next) => {
  if (req.auth === undefined || req.auth === null) {
    next(new AppError(401, "UNAUTHORIZED", "Authentication required"));
    return;
  }

  next();
};
