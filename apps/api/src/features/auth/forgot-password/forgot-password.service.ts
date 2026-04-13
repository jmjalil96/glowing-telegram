import type { Logger } from "pino";

import { authConstants } from "../../../auth/constants.js";
import {
  opaqueTokenService,
  type OpaqueTokenService,
} from "../../../auth/lib/opaque-token.js";
import { logger } from "../../../lib/logger.js";
import {
  auditLogService,
  type AuditContext,
  type AuditEvent,
  type AuditLogService,
} from "../../../services/audit/index.js";
import {
  emailService,
  type EmailService,
} from "../../../services/email/index.js";
import { buildPasswordResetRequestedAuditEvent } from "../audit-events.js";
import { buildPasswordResetEmail } from "../email/password-reset-email.js";
import {
  authRepository,
  type ActivePasswordResetUserRecord,
  type AuthRepository,
} from "../repositories/auth.repository.js";

interface ForgotPasswordParams {
  email: string;
  auditContext: AuditContext;
}

type ForgotPasswordLogger = Pick<Logger, "warn">;

interface CreateForgotPasswordServiceOptions {
  authRepository?: AuthRepository;
  opaqueTokenService?: Pick<OpaqueTokenService, "issue">;
  emailService?: Pick<EmailService, "send">;
  auditLogService?: Pick<AuditLogService, "record">;
  logger?: ForgotPasswordLogger;
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
  options: CreateForgotPasswordServiceOptions = {},
) => {
  const forgotPasswordRepository = options.authRepository ?? authRepository;
  const forgotPasswordOpaqueTokenService =
    options.opaqueTokenService ?? opaqueTokenService;
  const forgotPasswordEmailService = options.emailService ?? emailService;
  const forgotPasswordAuditLogService =
    options.auditLogService ?? auditLogService;
  const forgotPasswordLogger = options.logger ?? logger;
  const now = options.now ?? (() => new Date());

  const recordAuditEvent = async (
    event: AuditEvent,
    auditContext: AuditContext,
  ): Promise<void> => {
    try {
      await forgotPasswordAuditLogService.record(event, auditContext);
    } catch (error) {
      forgotPasswordLogger.warn(
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
      await forgotPasswordRepository.invalidateActivePasswordResetTokens(
        user.id,
        now(),
      );
    } catch (error) {
      forgotPasswordLogger.warn(
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
      const issuedToken = forgotPasswordOpaqueTokenService.issue();

      try {
        await forgotPasswordRepository.transaction(async (transaction) => {
          await transaction.invalidateActivePasswordResetTokens(
            userId,
            issuedAt,
          );
          await transaction.insertPasswordResetToken({
            userId,
            tokenHash: issuedToken.tokenHash,
            expiresAt,
          });
        });

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
        await forgotPasswordRepository.findActiveUserByEmail(normalizedEmail);

      if (user === null) {
        return;
      }

      const forgotPasswordTime = now();
      const resetToken = await issuePasswordResetToken(
        user.id,
        forgotPasswordTime,
      );

      try {
        await forgotPasswordEmailService.send(
          buildPasswordResetEmail({
            to: user.email,
            token: resetToken,
          }),
        );
      } catch (error) {
        forgotPasswordLogger.warn(
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

export const forgotPasswordService = createForgotPasswordService();
