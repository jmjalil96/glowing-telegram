import type { AuditEvent } from "../../../platform/audit/index.js";

type LoginFailureReason =
  | "account_not_found"
  | "account_inactive"
  | "email_not_verified"
  | "invalid_password";

interface BuildLoginFailedAuditEventOptions {
  reason: LoginFailureReason;
  userId?: string | null;
}

interface BuildLoginSucceededAuditEventOptions {
  userId: string;
  sessionId: string;
}

interface BuildLogoutSucceededAuditEventOptions {
  userId: string;
  sessionId: string;
}

interface BuildPasswordResetRequestedAuditEventOptions {
  userId: string;
}

interface BuildPasswordResetCompletedAuditEventOptions {
  userId: string;
}

export const buildLoginFailedAuditEvent = (
  options: BuildLoginFailedAuditEventOptions,
): AuditEvent => ({
  action: "auth.login.failed",
  ...(options.userId
    ? {
        targetType: "user",
        targetId: options.userId,
      }
    : {}),
  metadata: {
    method: "password",
    reason: options.reason,
  },
});

export const buildLoginSucceededAuditEvent = (
  options: BuildLoginSucceededAuditEventOptions,
): AuditEvent => ({
  action: "auth.login.succeeded",
  targetType: "user",
  targetId: options.userId,
  metadata: {
    method: "password",
    sessionId: options.sessionId,
  },
});

export const buildLogoutSucceededAuditEvent = (
  options: BuildLogoutSucceededAuditEventOptions,
): AuditEvent => ({
  action: "auth.logout.succeeded",
  targetType: "user",
  targetId: options.userId,
  metadata: {
    sessionId: options.sessionId,
  },
});

export const buildPasswordResetRequestedAuditEvent = (
  options: BuildPasswordResetRequestedAuditEventOptions,
): AuditEvent => ({
  action: "auth.password-reset.requested",
  targetType: "user",
  targetId: options.userId,
});

export const buildPasswordResetCompletedAuditEvent = (
  options: BuildPasswordResetCompletedAuditEventOptions,
): AuditEvent => ({
  action: "auth.password-reset.completed",
  targetType: "user",
  targetId: options.userId,
});

export type { LoginFailureReason };
