import { describe, expect, it } from "vitest";

import {
  AUTH_RESET_PASSWORD_PATH,
  authConstants,
} from "../../../../src/auth/constants.js";

describe("auth constants", () => {
  it("exposes the default session and reset policy", () => {
    expect(authConstants).toMatchObject({
      sessionCookieName: "techbros_session",
      sessionTtlMs: 30 * 24 * 60 * 60 * 1000,
      passwordResetTokenTtlMs: 30 * 60 * 1000,
      webAppUrl: "http://localhost:5173",
      resetPasswordPath: AUTH_RESET_PASSWORD_PATH,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        path: "/",
      },
    });
  });

  it("uses the default reset password path", () => {
    expect(AUTH_RESET_PASSWORD_PATH).toBe("/reset-password");
  });
});
