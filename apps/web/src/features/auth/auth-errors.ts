import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

import { isApiError } from "@/lib/api";

const genericFormErrorMessage =
  "We could not complete your request right now. Please try again.";

export const loginBusinessErrorCodes = [
  "ACCOUNT_NOT_FOUND",
  "INVALID_PASSWORD",
  "EMAIL_NOT_VERIFIED",
  "ACCOUNT_INACTIVE",
] as const;

export const resetBusinessErrorCodes = ["ACCOUNT_INACTIVE"] as const;

interface ApplyAuthFormErrorOptions<TFieldValues extends FieldValues> {
  allowedFieldNames: readonly Path<TFieldValues>[];
  error: unknown;
  knownCodes: readonly string[];
  setError: UseFormSetError<TFieldValues>;
}

interface AppliedAuthFormError {
  code: string | null;
  message: string | null;
}

export const applyAuthFormError = <TFieldValues extends FieldValues>({
  allowedFieldNames,
  error,
  knownCodes,
  setError,
}: ApplyAuthFormErrorOptions<TFieldValues>): AppliedAuthFormError => {
  if (!isApiError(error)) {
    return {
      code: null,
      message: genericFormErrorMessage,
    };
  }

  if (error.code === "VALIDATION_ERROR") {
    let mappedFieldError = false;

    for (const detail of error.details) {
      if (detail.source !== "body") {
        continue;
      }

      const fieldName = detail.path as Path<TFieldValues>;

      if (!allowedFieldNames.includes(fieldName)) {
        continue;
      }

      setError(fieldName, {
        message: detail.message,
        type: "server",
      });
      mappedFieldError = true;
    }

    return {
      code: error.code,
      message: mappedFieldError ? null : genericFormErrorMessage,
    };
  }

  if (knownCodes.includes(error.code)) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  return {
    code: error.code,
    message: genericFormErrorMessage,
  };
};

export const hasApiErrorCode = (error: unknown, code: string): boolean =>
  isApiError(error) && error.code === code;

export const hasValidationErrorForField = (
  error: unknown,
  field: string,
): boolean =>
  isApiError(error) &&
  error.code === "VALIDATION_ERROR" &&
  error.details.some(
    (detail) => detail.source === "body" && detail.path === field,
  );
