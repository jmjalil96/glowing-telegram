import { describe, expect, it, vi } from "vitest";

import { ApiError, type ApiErrorDetail, isApiError } from "@/lib/api";
import {
  applyAuthFormError,
  hasApiErrorCode,
  hasValidationErrorForField,
} from "@/features/auth/auth-errors";

const createApiError = ({
  code,
  details = [],
  message,
  status,
}: {
  code: string;
  details?: ApiErrorDetail[];
  message: string;
  status: number;
}) =>
  new ApiError({
    code,
    details,
    message,
    requestId: "request-id-1",
    status,
  });

describe("auth-errors", () => {
  it("maps validation errors onto allowed form fields", () => {
    const setError = vi.fn();
    const error = createApiError({
      code: "VALIDATION_ERROR",
      details: [
        {
          code: "INVALID_EMAIL",
          message: "Email is invalid.",
          path: "email",
          source: "body",
        },
        {
          code: "INVALID_PASSWORD",
          message: "Password is too weak.",
          path: "password",
          source: "body",
        },
      ],
      message: "Validation failed.",
      status: 400,
    });

    const result = applyAuthFormError({
      allowedFieldNames: ["email", "password"],
      error,
      knownCodes: [],
      setError,
    });

    expect(result).toEqual({
      code: "VALIDATION_ERROR",
      message: null,
    });
    expect(setError).toHaveBeenCalledWith("email", {
      message: "Email is invalid.",
      type: "server",
    });
    expect(setError).toHaveBeenCalledWith("password", {
      message: "Password is too weak.",
      type: "server",
    });
  });

  it("uses business error messages for known codes", () => {
    const result = applyAuthFormError({
      allowedFieldNames: ["email", "password"],
      error: createApiError({
        code: "ACCOUNT_INACTIVE",
        message: "Your account is inactive.",
        status: 403,
      }),
      knownCodes: ["ACCOUNT_INACTIVE"],
      setError: vi.fn(),
    });

    expect(result).toEqual({
      code: "ACCOUNT_INACTIVE",
      message: "Your account is inactive.",
    });
  });

  it("falls back to a generic form error for unknown failures", () => {
    const result = applyAuthFormError({
      allowedFieldNames: ["email"],
      error: new Error("boom"),
      knownCodes: [],
      setError: vi.fn(),
    });

    expect(result).toEqual({
      code: null,
      message:
        "We could not complete your request right now. Please try again.",
    });
  });

  it("detects API error codes and validation details by field", () => {
    const error = createApiError({
      code: "VALIDATION_ERROR",
      details: [
        {
          code: "INVALID_TOKEN",
          message: "Reset token is invalid.",
          path: "token",
          source: "body",
        },
      ],
      message: "Validation failed.",
      status: 400,
    });

    expect(isApiError(error)).toBe(true);
    expect(hasApiErrorCode(error, "VALIDATION_ERROR")).toBe(true);
    expect(hasValidationErrorForField(error, "token")).toBe(true);
    expect(hasValidationErrorForField(error, "password")).toBe(false);
  });
});
