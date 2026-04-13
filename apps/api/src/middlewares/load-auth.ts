import type { RequestHandler } from "express";

import { authConstants } from "../auth/constants.js";
import {
  sessionAuthService,
  type SessionAuthService,
} from "../auth/services/session-auth.service.js";

interface CreateLoadAuthMiddlewareOptions {
  sessionCookieName?: string;
  sessionAuthService?: Pick<SessionAuthService, "resolveRequestAuth">;
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
  options: CreateLoadAuthMiddlewareOptions = {},
): RequestHandler => {
  const sessionCookieName =
    options.sessionCookieName ?? authConstants.sessionCookieName;
  const authSessionService = options.sessionAuthService ?? sessionAuthService;

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

export const loadAuthMiddleware = createLoadAuthMiddleware();
