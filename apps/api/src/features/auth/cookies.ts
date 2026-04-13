import type { Response } from "express";

import { authConstants } from "../../auth/constants.js";

const sessionCookieOptions = {
  ...authConstants.cookie,
} as const;

export const setSessionCookie = (
  res: Response,
  sessionToken: string,
  expiresAt: Date,
): void => {
  res.cookie(authConstants.sessionCookieName, sessionToken, {
    ...sessionCookieOptions,
    expires: expiresAt,
  });
};

export const clearSessionCookie = (res: Response): void => {
  res.clearCookie(authConstants.sessionCookieName, sessionCookieOptions);
};
