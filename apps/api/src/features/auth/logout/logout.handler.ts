import type { RequestHandler } from "express";

import { buildAuditContext } from "../../../services/audit/index.js";
import { AppError } from "../../../errors/app-error.js";
import { clearSessionCookie } from "../cookies.js";
import { logoutService, type LogoutParams } from "./logout.service.js";

interface CreateLogoutHandlerOptions {
  logoutService?: Pick<typeof logoutService, "logout">;
}

export const createLogoutHandler = (
  options: CreateLogoutHandlerOptions = {},
): RequestHandler => {
  const authLogoutService = options.logoutService ?? logoutService;

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

export const logoutHandler = createLogoutHandler();
