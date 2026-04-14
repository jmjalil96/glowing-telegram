import { delay, http, HttpResponse } from "msw";

import type { AuthenticatedUser } from "@/features/auth/auth-client";

import { defaultAuthenticatedUser } from "./auth-fixtures";

export interface MockValidationDetail {
  code: string;
  message: string;
  path: string;
  source: "body" | "params" | "query";
}

export interface MockApiErrorOptions {
  code: string;
  details?: MockValidationDetail[];
  message: string;
  requestId?: string | null;
  status: number;
}

const defaultRequestId = "web-test-request-id";

export const createValidationDetail = (
  detail: Partial<MockValidationDetail> & Pick<MockValidationDetail, "path">,
): MockValidationDetail => ({
  code: detail.code ?? "INVALID_INPUT",
  message: detail.message ?? "Invalid input.",
  path: detail.path,
  source: detail.source ?? "body",
});

export const createApiErrorBody = ({
  code,
  details = [],
  message,
  requestId = defaultRequestId,
}: Omit<MockApiErrorOptions, "status">) => ({
  error: {
    code,
    details,
    message,
    requestId,
  },
});

export const createApiErrorResponse = ({
  status,
  ...error
}: MockApiErrorOptions) =>
  HttpResponse.json(createApiErrorBody(error), {
    status,
  });

export const createSuccessResponse = <TBody extends Record<string, unknown>>(
  body: TBody,
) => HttpResponse.json(body);

export const authHandlers = {
  forgotPasswordSuccess: ({
    delayMs = 0,
  }: {
    delayMs?: number;
  } = {}) =>
    http.post("/api/v1/auth/forgot-password", async () => {
      if (delayMs > 0) {
        await delay(delayMs);
      }

      return createSuccessResponse({
        success: true,
      });
    }),
  loginError: ({
    delayMs = 0,
    error,
  }: {
    delayMs?: number;
    error: MockApiErrorOptions;
  }) =>
    http.post("/api/v1/auth/login", async () => {
      if (delayMs > 0) {
        await delay(delayMs);
      }

      return createApiErrorResponse(error);
    }),
  loginSuccess: ({
    delayMs = 0,
    user = defaultAuthenticatedUser,
  }: {
    delayMs?: number;
    user?: AuthenticatedUser;
  } = {}) =>
    http.post("/api/v1/auth/login", async () => {
      if (delayMs > 0) {
        await delay(delayMs);
      }

      return createSuccessResponse({
        user,
      });
    }),
  logoutSuccess: ({
    delayMs = 0,
  }: {
    delayMs?: number;
  } = {}) =>
    http.post("/api/v1/auth/logout", async () => {
      if (delayMs > 0) {
        await delay(delayMs);
      }

      return createSuccessResponse({
        success: true,
      });
    }),
  logoutError: ({
    delayMs = 0,
    error,
  }: {
    delayMs?: number;
    error: MockApiErrorOptions;
  }) =>
    http.post("/api/v1/auth/logout", async () => {
      if (delayMs > 0) {
        await delay(delayMs);
      }

      return createApiErrorResponse(error);
    }),
  meSuccess: (user: AuthenticatedUser = defaultAuthenticatedUser) =>
    http.get("/api/v1/auth/me", () =>
      createSuccessResponse({
        user,
      }),
    ),
  meUnauthorized: ({
    message = "You must sign in to continue.",
  }: {
    message?: string;
  } = {}) =>
    http.get("/api/v1/auth/me", () =>
      createApiErrorResponse({
        code: "UNAUTHORIZED",
        message,
        status: 401,
      }),
    ),
  resetPasswordError: ({
    delayMs = 0,
    error,
  }: {
    delayMs?: number;
    error: MockApiErrorOptions;
  }) =>
    http.post("/api/v1/auth/reset-password", async () => {
      if (delayMs > 0) {
        await delay(delayMs);
      }

      return createApiErrorResponse(error);
    }),
  resetPasswordSuccess: ({
    delayMs = 0,
  }: {
    delayMs?: number;
  } = {}) =>
    http.post("/api/v1/auth/reset-password", async () => {
      if (delayMs > 0) {
        await delay(delayMs);
      }

      return createSuccessResponse({
        success: true,
      });
    }),
};

export const defaultMswHandlers = [authHandlers.meUnauthorized()];
