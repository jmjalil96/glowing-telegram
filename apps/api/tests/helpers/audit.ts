import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool as PgPool } from "pg";

import { auditLogsTable } from "../../src/platform/database/schema/audit.js";

export interface AuditLogRecord {
  id: string;
  tenantId: string | null;
  actorUserId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

const selectAuditLogFields = {
  id: auditLogsTable.id,
  tenantId: auditLogsTable.tenantId,
  actorUserId: auditLogsTable.actorUserId,
  action: auditLogsTable.action,
  targetType: auditLogsTable.targetType,
  targetId: auditLogsTable.targetId,
  requestId: auditLogsTable.requestId,
  ipAddress: auditLogsTable.ipAddress,
  userAgent: auditLogsTable.userAgent,
  metadata: auditLogsTable.metadata,
  createdAt: auditLogsTable.createdAt,
} as const;

export const clearAuditLogs = async (
  connectionString: string,
): Promise<void> => {
  const pool = new PgPool({
    connectionString,
  });
  const db = drizzle({
    client: pool,
    schema: {
      auditLogsTable,
    },
  });

  try {
    await db.delete(auditLogsTable);
  } finally {
    await pool.end();
  }
};

export const findLatestAuditLog = async ({
  connectionString,
  requestId,
  action,
}: {
  connectionString: string;
  requestId: string;
  action?: string;
}): Promise<AuditLogRecord | null> => {
  const pool = new PgPool({
    connectionString,
  });
  const db = drizzle({
    client: pool,
    schema: {
      auditLogsTable,
    },
  });

  try {
    const rows = await db
      .select(selectAuditLogFields)
      .from(auditLogsTable)
      .where(
        action
          ? and(
              eq(auditLogsTable.requestId, requestId),
              eq(auditLogsTable.action, action),
            )
          : eq(auditLogsTable.requestId, requestId),
      )
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(1);

    return rows[0] ?? null;
  } finally {
    await pool.end();
  }
};
