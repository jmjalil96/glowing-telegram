import type { Logger } from "pino";

import {
  type AuditContext,
  type AuditEvent,
} from "../../../platform/audit/index.js";
import {
  accountInactiveError,
  invalidResetTokenError,
} from "./identity-errors.js";
import { buildPasswordResetCompletedAuditEvent } from "./identity-audit-events.js";
import type {
  AuditRecorder,
  IdentityTransactionRunner,
  OpaqueTokenHasher,
  PasswordHasher,
  PasswordResetTokenReader,
  PasswordResetTokenRecord,
} from "./ports.js";

interface ResetPasswordParams {
  token: string;
  password: string;
  auditContext: AuditContext;
}

type ResetPasswordLogger = Pick<Logger, "warn">;

interface CreateResetPasswordServiceOptions {
  auditRecorder: AuditRecorder;
  opaqueTokenHasher: OpaqueTokenHasher;
  passwordHashGenerator: PasswordHasher;
  passwordResetTokenReader: PasswordResetTokenReader;
  transactionRunner: IdentityTransactionRunner;
  warningLogger: ResetPasswordLogger;
  now?: () => Date;
}

const AUDIT_FAILURE_MESSAGE =
  "Failed to record password reset completion audit event";

const createAuditContextForUser = (
  auditContext: AuditContext,
  resetToken: Pick<PasswordResetTokenRecord, "tenantId" | "userId">,
): AuditContext => ({
  ...auditContext,
  tenantId: resetToken.tenantId,
  actorUserId: resetToken.userId,
});

export const createResetPasswordService = (
  options: CreateResetPasswordServiceOptions,
) => {
  const resetPasswordTokenReader = options.passwordResetTokenReader;
  const resetPasswordTransactionRunner = options.transactionRunner;
  const resetPasswordHasher = options.passwordHashGenerator;
  const resetPasswordOpaqueTokenHasher = options.opaqueTokenHasher;
  const resetPasswordAuditRecorder = options.auditRecorder;
  const resetPasswordWarningLogger = options.warningLogger;
  const now = options.now ?? (() => new Date());

  const recordAuditEvent = async (
    event: AuditEvent,
    auditContext: AuditContext,
  ): Promise<void> => {
    try {
      await resetPasswordAuditRecorder.record(event, auditContext);
    } catch (error) {
      resetPasswordWarningLogger.warn(
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

  return {
    resetPassword: async ({
      token,
      password,
      auditContext,
    }: ResetPasswordParams): Promise<void> => {
      const resetTime = now();
      const tokenHash = resetPasswordOpaqueTokenHasher.hash(token);
      const resetToken =
        await resetPasswordTokenReader.findValidPasswordResetTokenByTokenHash(
          tokenHash,
          resetTime,
        );

      if (resetToken === null) {
        throw invalidResetTokenError();
      }

      if (!resetToken.isActive) {
        throw accountInactiveError();
      }

      const passwordHash = await resetPasswordHasher.hash(password);

      await resetPasswordTransactionRunner.transaction(async (transaction) => {
        const markedAsUsed = await transaction.markPasswordResetTokenUsed(
          resetToken.tokenId,
          resetTime,
        );

        if (!markedAsUsed) {
          throw invalidResetTokenError();
        }

        await transaction.invalidateActivePasswordResetTokens(
          resetToken.userId,
          resetTime,
        );
        await transaction.updateUserPassword({
          userId: resetToken.userId,
          passwordHash,
          emailVerifiedAt: resetToken.emailVerifiedAt ?? resetTime,
          updatedAt: resetTime,
        });
        await transaction.revokeAllSessionsByUserId(
          resetToken.userId,
          resetTime,
        );
      });

      await recordAuditEvent(
        buildPasswordResetCompletedAuditEvent({
          userId: resetToken.userId,
        }),
        createAuditContextForUser(auditContext, resetToken),
      );
    },
  };
};

export type { CreateResetPasswordServiceOptions, ResetPasswordParams };
