import { describe, expect, it, vi } from "vitest";

import { auditLogsTable } from "../../../../src/db/schema/audit.js";
import { createAuditLogService } from "../../../../src/services/audit/audit-log.service.js";
import type {
  AuditContext,
  AuditEvent,
} from "../../../../src/services/audit/types.js";

type CreateAuditLogServiceOptions = NonNullable<
  Parameters<typeof createAuditLogService>[0]
>;
type TestAuditLogDatabase = NonNullable<CreateAuditLogServiceOptions["db"]>;
type TestAuditLogLogger = NonNullable<CreateAuditLogServiceOptions["logger"]>;

const createLogger = (): TestAuditLogLogger => ({
  warn: vi.fn(),
  error: vi.fn(),
});

const event: AuditEvent = {
  action: "user.created",
};

const context: AuditContext = {
  requestId: "req-123",
  tenantId: "tenant-123",
  actorUserId: "user-123",
  ipAddress: "203.0.113.10",
  userAgent: "Vitest Agent",
};

describe("createAuditLogService", () => {
  it("normalizes missing metadata and optional fields before insert", async () => {
    let insertedTable: typeof auditLogsTable | null = null;
    let insertedValues: unknown;

    const db: TestAuditLogDatabase = {
      insert: (table) => {
        insertedTable = table;

        return {
          values: (values) => {
            insertedValues = values;

            return Promise.resolve();
          },
        };
      },
    };
    const logger = createLogger();
    const service = createAuditLogService({ db, logger });

    await service.record(
      event,
      {
        requestId: "req-456",
      },
      {},
    );

    expect(insertedTable).toBe(auditLogsTable);
    expect(insertedValues).toEqual({
      tenantId: null,
      actorUserId: null,
      action: "user.created",
      targetType: null,
      targetId: null,
      requestId: "req-456",
      ipAddress: null,
      userAgent: null,
      metadata: {},
    });
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("swallows insert failures by default and logs a warning", async () => {
    const error = new Error("database unavailable");
    const logger = createLogger();
    const service = createAuditLogService({
      db: {
        insert: () => ({
          values: () => Promise.reject(error),
        }),
      },
      logger,
    });

    await expect(service.record(event, context)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        err: error,
        action: "user.created",
        requestId: "req-123",
        tenantId: "tenant-123",
        actorUserId: "user-123",
      }),
      "Failed to record audit log",
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("rethrows insert failures in strict mode and logs an error", async () => {
    const error = new Error("database unavailable");
    const logger = createLogger();
    const service = createAuditLogService({
      db: {
        insert: () => ({
          values: () => Promise.reject(error),
        }),
      },
      logger,
    });

    await expect(
      service.record(event, context, {
        strict: true,
      }),
    ).rejects.toBe(error);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: error,
        action: "user.created",
        requestId: "req-123",
        tenantId: "tenant-123",
        actorUserId: "user-123",
      }),
      "Failed to record audit log",
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
