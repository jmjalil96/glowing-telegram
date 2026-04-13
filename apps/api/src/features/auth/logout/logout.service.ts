import type { Logger } from "pino";

import type { RequestAuth } from "../../../auth/types.js";
import { logger } from "../../../lib/logger.js";
import {
  auditLogService,
  type AuditContext,
  type AuditEvent,
  type AuditLogService,
} from "../../../services/audit/index.js";
import { buildLogoutSucceededAuditEvent } from "../audit-events.js";
import {
  authRepository,
  type AuthRepository,
} from "../repositories/auth.repository.js";

interface LogoutParams {
  auth: RequestAuth;
  auditContext: AuditContext;
}

type LogoutLogger = Pick<Logger, "warn">;

interface CreateLogoutServiceOptions {
  authRepository?: Pick<AuthRepository, "revokeSessionById">;
  auditLogService?: Pick<AuditLogService, "record">;
  logger?: LogoutLogger;
  now?: () => Date;
}

const AUDIT_FAILURE_MESSAGE = "Failed to record logout audit event";

const createAuditContextForAuth = (
  auditContext: AuditContext,
  auth: RequestAuth,
): AuditContext => ({
  ...auditContext,
  tenantId: auth.tenantId,
  actorUserId: auth.userId,
});

export const createLogoutService = (
  options: CreateLogoutServiceOptions = {},
) => {
  const logoutRepository = options.authRepository ?? authRepository;
  const logoutAuditLogService = options.auditLogService ?? auditLogService;
  const logoutLogger = options.logger ?? logger;
  const now = options.now ?? (() => new Date());

  const recordAuditEvent = async (
    event: AuditEvent,
    auditContext: AuditContext,
  ): Promise<void> => {
    try {
      await logoutAuditLogService.record(event, auditContext);
    } catch (error) {
      logoutLogger.warn(
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
    logout: async ({ auth, auditContext }: LogoutParams): Promise<void> => {
      const logoutTime = now();

      await logoutRepository.revokeSessionById(auth.sessionId, logoutTime);
      await recordAuditEvent(
        buildLogoutSucceededAuditEvent({
          userId: auth.userId,
          sessionId: auth.sessionId,
        }),
        createAuditContextForAuth(auditContext, auth),
      );
    },
  };
};

export type { CreateLogoutServiceOptions, LogoutParams };

export const logoutService = createLogoutService();
