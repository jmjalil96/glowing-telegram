import type { Logger } from "pino";

import {
  opaqueTokenService,
  type OpaqueTokenService,
} from "../../../auth/lib/opaque-token.js";
import {
  passwordHasher,
  type PasswordHasher,
} from "../../../auth/lib/password-hasher.js";
import { logger } from "../../../lib/logger.js";
import {
  auditLogService,
  type AuditContext,
  type AuditEvent,
  type AuditLogService,
} from "../../../services/audit/index.js";
import { accountInactiveError, invalidResetTokenError } from "../errors.js";
import { buildPasswordResetCompletedAuditEvent } from "../audit-events.js";
import {
  authRepository,
  type AuthRepository,
  type PasswordResetTokenRecord,
} from "../repositories/auth.repository.js";

interface ResetPasswordParams {
  token: string;
  password: string;
  auditContext: AuditContext;
}

type ResetPasswordLogger = Pick<Logger, "warn">;

interface CreateResetPasswordServiceOptions {
  authRepository?: AuthRepository;
  passwordHasher?: Pick<PasswordHasher, "hash">;
  opaqueTokenService?: Pick<OpaqueTokenService, "hash">;
  auditLogService?: Pick<AuditLogService, "record">;
  logger?: ResetPasswordLogger;
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
  options: CreateResetPasswordServiceOptions = {},
) => {
  const resetPasswordRepository = options.authRepository ?? authRepository;
  const resetPasswordHasher = options.passwordHasher ?? passwordHasher;
  const resetPasswordOpaqueTokenService =
    options.opaqueTokenService ?? opaqueTokenService;
  const resetPasswordAuditLogService =
    options.auditLogService ?? auditLogService;
  const resetPasswordLogger = options.logger ?? logger;
  const now = options.now ?? (() => new Date());

  const recordAuditEvent = async (
    event: AuditEvent,
    auditContext: AuditContext,
  ): Promise<void> => {
    try {
      await resetPasswordAuditLogService.record(event, auditContext);
    } catch (error) {
      resetPasswordLogger.warn(
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
      const tokenHash = resetPasswordOpaqueTokenService.hash(token);
      const resetToken =
        await resetPasswordRepository.findValidPasswordResetTokenByTokenHash(
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

      await resetPasswordRepository.transaction(async (transaction) => {
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

export const resetPasswordService = createResetPasswordService();
