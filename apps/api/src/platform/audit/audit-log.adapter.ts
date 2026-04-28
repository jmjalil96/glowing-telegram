import type { InferInsertModel } from "drizzle-orm";
import type { Logger } from "pino";

import { db } from "../database/client.js";
import { auditLogsTable } from "../database/schema/audit.js";
import { logger } from "../logger/logger.js";
import type {
  AuditContext,
  AuditEvent,
  RecordAuditOptions,
} from "./audit.port.js";

type AuditLogInsert = InferInsertModel<typeof auditLogsTable>;

interface AuditLogInsertQuery {
  values(values: AuditLogInsert): PromiseLike<unknown>;
}

interface AuditLogDatabase {
  insert(table: typeof auditLogsTable): AuditLogInsertQuery;
}

type AuditLogLogger = Pick<Logger, "error" | "warn">;

interface CreateAuditLogServiceOptions {
  db?: AuditLogDatabase;
  logger?: AuditLogLogger;
}

const AUDIT_LOG_FAILURE_MESSAGE = "Failed to record audit log";

const buildInsertValues = (
  event: AuditEvent,
  context: AuditContext,
): AuditLogInsert => ({
  tenantId: context.tenantId ?? null,
  actorUserId: context.actorUserId ?? null,
  action: event.action,
  targetType: event.targetType ?? null,
  targetId: event.targetId ?? null,
  requestId: context.requestId ?? null,
  ipAddress: context.ipAddress ?? null,
  userAgent: context.userAgent ?? null,
  metadata: event.metadata ?? {},
});

export const createAuditLogService = (
  options: CreateAuditLogServiceOptions = {},
) => {
  const auditDb = options.db ?? db;
  const auditLogger = options.logger ?? logger;

  return {
    record: async (
      event: AuditEvent,
      context: AuditContext,
      recordOptions: RecordAuditOptions = {},
    ): Promise<void> => {
      const values = buildInsertValues(event, context);

      try {
        await auditDb.insert(auditLogsTable).values(values);
      } catch (error) {
        const logDetails = {
          err: error,
          action: event.action,
          requestId: values.requestId,
          tenantId: values.tenantId,
          actorUserId: values.actorUserId,
        };

        if (recordOptions.strict === true) {
          auditLogger.error(logDetails, AUDIT_LOG_FAILURE_MESSAGE);
          throw error;
        }

        auditLogger.warn(logDetails, AUDIT_LOG_FAILURE_MESSAGE);
      }
    },
  };
};

export type AuditLogService = ReturnType<typeof createAuditLogService>;

export const auditLogService = createAuditLogService();
