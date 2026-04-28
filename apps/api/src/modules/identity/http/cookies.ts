import type { Response } from "express";

import { env } from "../../../platform/config/env.js";
import { AUTH_SESSION_COOKIE_NAME } from "../domain/identity-constants.js";

const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.NODE_ENV === "production",
  path: "/",
} as const;

export const setSessionCookie = (
  res: Response,
  sessionToken: string,
  expiresAt: Date,
): void => {
  res.cookie(AUTH_SESSION_COOKIE_NAME, sessionToken, {
    ...sessionCookieOptions,
    expires: expiresAt,
  });
};

export const clearSessionCookie = (res: Response): void => {
  res.clearCookie(AUTH_SESSION_COOKIE_NAME, sessionCookieOptions);
};
