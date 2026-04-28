import type { RequestHandler } from "express";

import { AppError } from "../../../platform/http/app-error.js";
import { AUTH_SESSION_COOKIE_NAME } from "../domain/identity-constants.js";
import type { SessionAuthService } from "../application/resolve-request-auth.use-case.js";

interface CreateLoadAuthMiddlewareOptions {
  sessionCookieName?: string;
  sessionAuthService: Pick<SessionAuthService, "resolveRequestAuth">;
}

const getSessionCookieValue = (
  cookieHeader: string,
  sessionCookieName: string,
): string | undefined => {
  for (const segment of cookieHeader.split(";")) {
    const trimmedSegment = segment.trim();

    if (trimmedSegment.length === 0) {
      continue;
    }

    const separatorIndex = trimmedSegment.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const name = trimmedSegment.slice(0, separatorIndex).trim();

    if (name !== sessionCookieName) {
      continue;
    }

    const value = trimmedSegment.slice(separatorIndex + 1).trim();

    return value.length > 0 ? value : undefined;
  }

  return undefined;
};

export const createLoadAuthMiddleware = (
  options: CreateLoadAuthMiddlewareOptions,
): RequestHandler => {
  const sessionCookieName =
    options.sessionCookieName ?? AUTH_SESSION_COOKIE_NAME;
  const authSessionService = options.sessionAuthService;

  return async (req, _res, next) => {
    req.auth = null;

    try {
      const cookieHeader = req.get("cookie");

      if (cookieHeader === undefined) {
        next();
        return;
      }

      const sessionToken = getSessionCookieValue(
        cookieHeader,
        sessionCookieName,
      );

      if (sessionToken === undefined) {
        next();
        return;
      }

      req.auth = await authSessionService.resolveRequestAuth(sessionToken);
      next();
    } catch (error) {
      next(error);
    }
  };
};

export const requireAuthMiddleware: RequestHandler = (req, _res, next) => {
  if (req.auth === undefined || req.auth === null) {
    next(new AppError(401, "UNAUTHORIZED", "Authentication required"));
    return;
  }

  next();
};
