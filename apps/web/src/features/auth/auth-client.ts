import { fetchJson } from "@/lib/api";

export interface AuthenticatedUser {
  displayName: string | null;
  email: string;
  emailVerifiedAt: string | null;
  tenantId: string;
  userId: string;
}

export interface AuthenticatedUserResponse {
  user: AuthenticatedUser;
}

export interface ForgotPasswordInput {
  email: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

interface RequestOptions {
  signal?: AbortSignal;
}

export interface ResetPasswordInput {
  password: string;
  token: string;
}

export interface SuccessResponse {
  success: true;
}

export const login = (
  input: LoginInput,
  options: RequestOptions = {},
): Promise<AuthenticatedUserResponse> =>
  fetchJson("/api/v1/auth/login", {
    body: input,
    method: "POST",
    signal: options.signal,
  });

export const me = (
  options: RequestOptions = {},
): Promise<AuthenticatedUserResponse> =>
  fetchJson("/api/v1/auth/me", {
    method: "GET",
    signal: options.signal,
  });

export const logout = (
  options: RequestOptions = {},
): Promise<SuccessResponse> =>
  fetchJson("/api/v1/auth/logout", {
    method: "POST",
    signal: options.signal,
  });

export const forgotPassword = (
  input: ForgotPasswordInput,
  options: RequestOptions = {},
): Promise<SuccessResponse> =>
  fetchJson("/api/v1/auth/forgot-password", {
    body: input,
    method: "POST",
    signal: options.signal,
  });

export const resetPassword = (
  input: ResetPasswordInput,
  options: RequestOptions = {},
): Promise<SuccessResponse> =>
  fetchJson("/api/v1/auth/reset-password", {
    body: input,
    method: "POST",
    signal: options.signal,
  });
