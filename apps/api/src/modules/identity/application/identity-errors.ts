import { AppError } from "../../../platform/http/app-error.js";

const authErrorDefinitions = {
  ACCOUNT_NOT_FOUND: {
    statusCode: 401,
    message: "Account not found",
  },
  ACCOUNT_INACTIVE: {
    statusCode: 403,
    message: "Account is inactive",
  },
  EMAIL_NOT_VERIFIED: {
    statusCode: 403,
    message: "Email is not verified",
  },
  INVALID_PASSWORD: {
    statusCode: 401,
    message: "Invalid password",
  },
  INVALID_RESET_TOKEN: {
    statusCode: 400,
    message: "Invalid or expired reset token",
  },
} as const;

type AuthErrorCode = keyof typeof authErrorDefinitions;
type AuthLoginErrorCode = Exclude<AuthErrorCode, "INVALID_RESET_TOKEN">;

export const createAuthError = (code: AuthErrorCode): AppError => {
  const definition = authErrorDefinitions[code];

  return new AppError(definition.statusCode, code, definition.message);
};

export const createAuthLoginError = (code: AuthLoginErrorCode): AppError =>
  createAuthError(code);

export const accountNotFoundError = (): AppError =>
  createAuthLoginError("ACCOUNT_NOT_FOUND");

export const accountInactiveError = (): AppError =>
  createAuthLoginError("ACCOUNT_INACTIVE");

export const emailNotVerifiedError = (): AppError =>
  createAuthLoginError("EMAIL_NOT_VERIFIED");

export const invalidPasswordError = (): AppError =>
  createAuthLoginError("INVALID_PASSWORD");

export const invalidResetTokenError = (): AppError =>
  createAuthError("INVALID_RESET_TOKEN");

export type { AuthErrorCode, AuthLoginErrorCode };
