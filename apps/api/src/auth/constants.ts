import { env } from "../config/env.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export const AUTH_RESET_PASSWORD_PATH = "/reset-password";
export const AUTH_PASSWORD_RESET_TOKEN_TYPE = "password_reset";
const authCookieDefaults = Object.freeze({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.NODE_ENV === "production",
  path: "/",
});

export const authConstants = Object.freeze({
  sessionCookieName: "techbros_session",
  sessionTtlMs: 30 * DAY_MS,
  passwordResetTokenTtlMs: 30 * MINUTE_MS,
  webAppUrl: env.WEB_APP_URL,
  resetPasswordPath: AUTH_RESET_PASSWORD_PATH,
  cookie: authCookieDefaults,
});
