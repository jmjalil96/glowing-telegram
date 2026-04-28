import type { Logger } from "pino";

import {
  type AuditContext,
  type AuditEvent,
} from "../../../platform/audit/index.js";
import { authConstants } from "../domain/identity-constants.js";
import { buildPasswordResetRequestedAuditEvent } from "./identity-audit-events.js";
import { buildPasswordResetEmail } from "../email/password-reset-email.js";
import type {
  ActivePasswordResetUserReader,
  ActivePasswordResetUserRecord,
  AuditRecorder,
  EmailSender,
  IdentityTransactionRunner,
  OpaqueTokenIssuer,
  PasswordResetTokenWriter,
} from "./ports.js";

interface ForgotPasswordParams {
  email: string;
  auditContext: AuditContext;
}

type ForgotPasswordLogger = Pick<Logger, "warn">;

interface CreateForgotPasswordServiceOptions {
  activePasswordResetUserReader: ActivePasswordResetUserReader;
  auditRecorder: AuditRecorder;
  emailSender: EmailSender;
  opaqueTokenIssuer: OpaqueTokenIssuer;
  passwordResetTokenWriter: Pick<
    PasswordResetTokenWriter,
    "invalidateActivePasswordResetTokens"
  >;
  transactionRunner: IdentityTransactionRunner;
  warningLogger: ForgotPasswordLogger;
  now?: () => Date;
}

const MAX_PASSWORD_RESET_TOKEN_ISSUE_ATTEMPTS = 3;
const UNIQUE_VIOLATION_ERROR_CODE = "23505";
const AUDIT_FAILURE_MESSAGE =
  "Failed to record password reset request audit event";
const EMAIL_FAILURE_MESSAGE = "Failed to send password reset email";
const TOKEN_INVALIDATION_FAILURE_MESSAGE =
  "Failed to invalidate password reset token after email send failure";

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const isUniqueViolationError = (error: unknown): error is { code: string } => {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  return "code" in error && error.code === UNIQUE_VIOLATION_ERROR_CODE;
};

const createAuditContextForUser = (
  auditContext: AuditContext,
  user: ActivePasswordResetUserRecord,
): AuditContext => ({
  ...auditContext,
  tenantId: user.tenantId,
  actorUserId: user.id,
});

export const createForgotPasswordService = (
  options: CreateForgotPasswordServiceOptions,
) => {
  const activePasswordResetUserReader = options.activePasswordResetUserReader;
  const forgotPasswordTokenWriter = options.passwordResetTokenWriter;
  const forgotPasswordTransactionRunner = options.transactionRunner;
  const forgotPasswordOpaqueTokenIssuer = options.opaqueTokenIssuer;
  const forgotPasswordEmailSender = options.emailSender;
  const forgotPasswordAuditRecorder = options.auditRecorder;
  const forgotPasswordWarningLogger = options.warningLogger;
  const now = options.now ?? (() => new Date());

  const recordAuditEvent = async (
    event: AuditEvent,
    auditContext: AuditContext,
  ): Promise<void> => {
    try {
      await forgotPasswordAuditRecorder.record(event, auditContext);
    } catch (error) {
      forgotPasswordWarningLogger.warn(
        {
          err: error,
          action: event.action,
          requestId: auditContext.requestId ?? null,
          tenantId: auditContext.tenantId ?? null,
          actorUserId: auditContext.actorUserId ?? null,
        },
        AUDIT_FAILURE_MESSAGE,
      );
    }
  };

  const invalidatePasswordResetTokensAfterEmailFailure = async (
    user: ActivePasswordResetUserRecord,
    auditContext: AuditContext,
  ): Promise<void> => {
    try {
      await forgotPasswordTokenWriter.invalidateActivePasswordResetTokens(
        user.id,
        now(),
      );
    } catch (error) {
      forgotPasswordWarningLogger.warn(
        {
          err: error,
          requestId: auditContext.requestId ?? null,
          tenantId: user.tenantId,
          actorUserId: user.id,
        },
        TOKEN_INVALIDATION_FAILURE_MESSAGE,
      );
    }
  };

  const issuePasswordResetToken = async (
    userId: string,
    issuedAt: Date,
  ): Promise<string> => {
    const expiresAt = new Date(
      issuedAt.getTime() + authConstants.passwordResetTokenTtlMs,
    );

    for (
      let attempt = 0;
      attempt < MAX_PASSWORD_RESET_TOKEN_ISSUE_ATTEMPTS;
      attempt += 1
    ) {
      const issuedToken = forgotPasswordOpaqueTokenIssuer.issue();

      try {
        await forgotPasswordTransactionRunner.transaction(
          async (transaction) => {
            await transaction.invalidateActivePasswordResetTokens(
              userId,
              issuedAt,
            );
            await transaction.insertPasswordResetToken({
              userId,
              tokenHash: issuedToken.tokenHash,
              expiresAt,
            });
          },
        );

        return issuedToken.token;
      } catch (error) {
        if (isUniqueViolationError(error)) {
          continue;
        }

        throw error;
      }
    }

    throw new Error("Failed to create password reset token");
  };

  return {
    forgotPassword: async ({
      email,
      auditContext,
    }: ForgotPasswordParams): Promise<void> => {
      const normalizedEmail = normalizeEmail(email);
      const user =
        await activePasswordResetUserReader.findActiveUserByEmail(
          normalizedEmail,
        );

      if (user === null) {
        return;
      }

      const forgotPasswordTime = now();
      const resetToken = await issuePasswordResetToken(
        user.id,
        forgotPasswordTime,
      );

      try {
        await forgotPasswordEmailSender.send(
          buildPasswordResetEmail({
            to: user.email,
            token: resetToken,
          }),
        );
      } catch (error) {
        forgotPasswordWarningLogger.warn(
          {
            err: error,
            requestId: auditContext.requestId ?? null,
            tenantId: user.tenantId,
            actorUserId: user.id,
          },
          EMAIL_FAILURE_MESSAGE,
        );
        await invalidatePasswordResetTokensAfterEmailFailure(
          user,
          auditContext,
        );
        return;
      }

      await recordAuditEvent(
        buildPasswordResetRequestedAuditEvent({
          userId: user.id,
        }),
        createAuditContextForUser(auditContext, user),
      );
    },
  };
};

export type {
  CreateForgotPasswordServiceOptions,
  ForgotPasswordParams,
  ForgotPasswordLogger,
};
