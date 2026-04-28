const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export const AUTH_RESET_PASSWORD_PATH = "/reset-password";
export const AUTH_PASSWORD_RESET_TOKEN_TYPE = "password_reset";
export const AUTH_SESSION_COOKIE_NAME = "techbros_session";
export const AUTH_SESSION_TTL_MS = 30 * DAY_MS;
export const AUTH_PASSWORD_RESET_TOKEN_TTL_MS = 30 * MINUTE_MS;

export const authConstants = Object.freeze({
  sessionCookieName: AUTH_SESSION_COOKIE_NAME,
  sessionTtlMs: AUTH_SESSION_TTL_MS,
  passwordResetTokenTtlMs: AUTH_PASSWORD_RESET_TOKEN_TTL_MS,
  resetPasswordPath: AUTH_RESET_PASSWORD_PATH,
});
