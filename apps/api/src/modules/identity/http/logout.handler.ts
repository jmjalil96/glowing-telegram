import type { RequestHandler } from "express";

import { buildAuditContext } from "../../../platform/audit/index.js";
import { AppError } from "../../../platform/http/app-error.js";
import type { LogoutParams } from "../application/logout.use-case.js";
import { clearSessionCookie } from "./cookies.js";

interface CreateLogoutHandlerOptions {
  logoutService: {
    logout(params: LogoutParams): Promise<void>;
  };
}

export const createLogoutHandler = (
  options: CreateLogoutHandlerOptions,
): RequestHandler => {
  const authLogoutService = options.logoutService;

  return async (req, res, next) => {
    if (req.auth === undefined || req.auth === null) {
      next(new AppError(401, "UNAUTHORIZED", "Authentication required"));
      return;
    }

    await authLogoutService.logout({
      auth: req.auth,
      auditContext: buildAuditContext({
        requestId: req.requestId,
        ...(req.ip ? { ip: req.ip } : {}),
        get: (name) => req.get(name),
      }),
    } satisfies LogoutParams);

    clearSessionCookie(res);
    res.status(200).json({
      success: true,
    });
  };
};
