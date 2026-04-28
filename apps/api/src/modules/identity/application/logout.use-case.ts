import type { Logger } from "pino";

import type { RequestAuth } from "../domain/request-auth.js";
import {
  type AuditContext,
  type AuditEvent,
} from "../../../platform/audit/index.js";
import { buildLogoutSucceededAuditEvent } from "./identity-audit-events.js";
import type { AuditRecorder, SessionWriter } from "./ports.js";

interface LogoutParams {
  auth: RequestAuth;
  auditContext: AuditContext;
}

type LogoutLogger = Pick<Logger, "warn">;

interface CreateLogoutServiceOptions {
  auditRecorder: AuditRecorder;
  sessionWriter: Pick<SessionWriter, "revokeSessionById">;
  warningLogger: LogoutLogger;
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

export const createLogoutService = (options: CreateLogoutServiceOptions) => {
  const logoutSessionWriter = options.sessionWriter;
  const logoutAuditRecorder = options.auditRecorder;
  const logoutWarningLogger = options.warningLogger;
  const now = options.now ?? (() => new Date());

  const recordAuditEvent = async (
    event: AuditEvent,
    auditContext: AuditContext,
  ): Promise<void> => {
    try {
      await logoutAuditRecorder.record(event, auditContext);
    } catch (error) {
      logoutWarningLogger.warn(
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

      await logoutSessionWriter.revokeSessionById(auth.sessionId, logoutTime);
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
