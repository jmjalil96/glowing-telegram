import type { Logger } from "pino";

import { authConstants } from "../../../auth/constants.js";
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
import {
  buildLoginFailedAuditEvent,
  buildLoginSucceededAuditEvent,
  type LoginFailureReason,
} from "../audit-events.js";
import {
  mapUserRecordToAuthenticatedUser,
  type AuthenticatedUser,
} from "../auth-user.js";
import { createAuthLoginError, type AuthLoginErrorCode } from "../errors.js";
import {
  authRepository,
  type AuthLoginUserRecord,
  type AuthLoginUserStateRecord,
  type AuthRepository,
} from "../repositories/auth.repository.js";

interface LoginParams {
  email: string;
  password: string;
  auditContext: AuditContext;
  currentSessionId?: string | null;
}

interface LoginResult {
  user: AuthenticatedUser;
  sessionToken: string;
  expiresAt: Date;
}

type LoginTransactionResult =
  | {
      type: "success";
      user: AuthLoginUserStateRecord;
      sessionId: string;
    }
  | {
      type: "failure";
      code: Exclude<AuthLoginErrorCode, "INVALID_PASSWORD">;
      user?: AuthLoginUserStateRecord;
    };

type LoginLogger = Pick<Logger, "warn">;

interface CreateLoginServiceOptions {
  authRepository?: AuthRepository;
  passwordHasher?: Pick<PasswordHasher, "verify">;
  opaqueTokenService?: Pick<OpaqueTokenService, "issue">;
  auditLogService?: Pick<AuditLogService, "record">;
  logger?: LoginLogger;
  now?: () => Date;
}

const MAX_SESSION_ISSUE_ATTEMPTS = 3;
const UNIQUE_VIOLATION_ERROR_CODE = "23505";
const AUDIT_FAILURE_MESSAGE = "Failed to record login audit event";

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const isUniqueViolationError = (error: unknown): error is { code: string } => {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  return "code" in error && error.code === UNIQUE_VIOLATION_ERROR_CODE;
};

const getFailureReasonFromCode = (
  code: AuthLoginErrorCode,
): LoginFailureReason => {
  switch (code) {
    case "ACCOUNT_NOT_FOUND":
      return "account_not_found";
    case "ACCOUNT_INACTIVE":
      return "account_inactive";
    case "EMAIL_NOT_VERIFIED":
      return "email_not_verified";
    case "INVALID_PASSWORD":
      return "invalid_password";
  }
};

const createAuditContextForUser = (
  auditContext: AuditContext,
  user?: Pick<AuthLoginUserRecord, "id" | "tenantId"> | null,
): AuditContext => ({
  ...auditContext,
  tenantId: user?.tenantId ?? null,
  actorUserId: user?.id ?? null,
});

const createLoginFailureResult = (
  code: Exclude<AuthLoginErrorCode, "INVALID_PASSWORD">,
  user?: AuthLoginUserStateRecord,
): LoginTransactionResult => ({
  type: "failure",
  code,
  ...(user ? { user } : {}),
});

export const createLoginService = (options: CreateLoginServiceOptions = {}) => {
  const loginRepository = options.authRepository ?? authRepository;
  const loginPasswordHasher = options.passwordHasher ?? passwordHasher;
  const loginOpaqueTokenService =
    options.opaqueTokenService ?? opaqueTokenService;
  const loginAuditLogService = options.auditLogService ?? auditLogService;
  const loginLogger = options.logger ?? logger;
  const now = options.now ?? (() => new Date());

  const recordAuditEvent = async (
    event: AuditEvent,
    auditContext: AuditContext,
  ): Promise<void> => {
    try {
      await loginAuditLogService.record(event, auditContext);
    } catch (error) {
      loginLogger.warn(
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

  const rejectLogin = async (
    code: AuthLoginErrorCode,
    auditContext: AuditContext,
    user?: AuthLoginUserRecord | AuthLoginUserStateRecord | null,
  ): Promise<never> => {
    await recordAuditEvent(
      buildLoginFailedAuditEvent({
        reason: getFailureReasonFromCode(code),
        userId: user?.id ?? null,
      }),
      createAuditContextForUser(auditContext, user),
    );

    throw createAuthLoginError(code);
  };

  return {
    login: async ({
      email,
      password,
      auditContext,
      currentSessionId = null,
    }: LoginParams): Promise<LoginResult> => {
      const normalizedEmail = normalizeEmail(email);
      const user = await loginRepository.findUserByEmail(normalizedEmail);

      if (user === null) {
        return rejectLogin("ACCOUNT_NOT_FOUND", auditContext);
      }

      if (!user.isActive) {
        return rejectLogin("ACCOUNT_INACTIVE", auditContext, user);
      }

      if (user.emailVerifiedAt === null) {
        return rejectLogin("EMAIL_NOT_VERIFIED", auditContext, user);
      }

      const passwordMatches = await loginPasswordHasher.verify(
        password,
        user.passwordHash,
      );

      if (!passwordMatches) {
        return rejectLogin("INVALID_PASSWORD", auditContext, user);
      }

      const loginTime = now();
      const expiresAt = new Date(
        loginTime.getTime() + authConstants.sessionTtlMs,
      );

      for (
        let attempt = 0;
        attempt < MAX_SESSION_ISSUE_ATTEMPTS;
        attempt += 1
      ) {
        const issuedToken = loginOpaqueTokenService.issue();

        try {
          const transactionResult = await loginRepository.transaction(
            async (transaction) => {
              const currentUser = await transaction.findUserStateById(user.id);

              if (!currentUser) {
                return createLoginFailureResult("ACCOUNT_NOT_FOUND");
              }

              if (!currentUser.isActive) {
                return createLoginFailureResult(
                  "ACCOUNT_INACTIVE",
                  currentUser,
                );
              }

              if (currentUser.emailVerifiedAt === null) {
                return createLoginFailureResult(
                  "EMAIL_NOT_VERIFIED",
                  currentUser,
                );
              }

              if (currentSessionId !== null) {
                await transaction.revokeSessionById(
                  currentSessionId,
                  loginTime,
                );
              }

              const session = await transaction.insertSession({
                userId: currentUser.id,
                tokenHash: issuedToken.tokenHash,
                expiresAt,
              });

              return {
                type: "success",
                user: currentUser,
                sessionId: session.sessionId,
              } satisfies LoginTransactionResult;
            },
          );

          if (transactionResult.type === "failure") {
            return rejectLogin(
              transactionResult.code,
              auditContext,
              transactionResult.user ?? null,
            );
          }

          const authenticatedUser = mapUserRecordToAuthenticatedUser(
            transactionResult.user,
          );

          await recordAuditEvent(
            buildLoginSucceededAuditEvent({
              userId: transactionResult.user.id,
              sessionId: transactionResult.sessionId,
            }),
            createAuditContextForUser(auditContext, transactionResult.user),
          );

          return {
            user: authenticatedUser,
            sessionToken: issuedToken.token,
            expiresAt,
          };
        } catch (error) {
          if (
            isUniqueViolationError(error) &&
            attempt < MAX_SESSION_ISSUE_ATTEMPTS - 1
          ) {
            continue;
          }

          throw error;
        }
      }

      throw new Error("Failed to issue a unique session token");
    },
  };
};

export type {
  AuthenticatedUser,
  CreateLoginServiceOptions,
  LoginParams,
  LoginResult,
};

export const loginService = createLoginService();
