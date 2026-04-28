import type { RequestHandler } from "express";

import { AppError } from "../../../platform/http/app-error.js";
import { mapRequestAuthToAuthenticatedUser } from "../domain/authenticated-user.js";

export const createMeHandler = (): RequestHandler => (req, res, next) => {
  if (req.auth === undefined || req.auth === null) {
    next(new AppError(401, "UNAUTHORIZED", "Authentication required"));
    return;
  }

  res.status(200).json({
    user: mapRequestAuthToAuthenticatedUser(req.auth),
  });
};
