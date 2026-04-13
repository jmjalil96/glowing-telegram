import { randomUUID } from "node:crypto";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { runMigrations, truncateTables } from "../helpers/database.js";
import { resetModuleGraph } from "../helpers/module.js";

describe("audit log service integration", () => {
  const defaultDatabaseUrl = process.env.DATABASE_URL;

  let container: Awaited<ReturnType<PostgreSqlContainer["start"]>> | null =
    null;
  let createAuditLogService: Awaited<
    ReturnType<typeof loadAuditServiceModule>
  >["createAuditLogService"];
  let pool: Awaited<ReturnType<typeof loadDbClient>>["pool"];
  let db: Awaited<ReturnType<typeof loadDbClient>>["db"];
  let closePool: Awaited<ReturnType<typeof loadDbClient>>["closePool"] | null =
    null;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:17")
      .withDatabase("techbros_api_test")
      .withUsername("postgres")
      .withPassword("postgres")
      .start();

    process.env.DATABASE_URL = container.getConnectionUri();
    resetModuleGraph();

    ({ pool, db, closePool } = await loadDbClient());
    ({ createAuditLogService } = await loadAuditServiceModule());
    const { logger } = await import("../../src/lib/logger.js");

    await runMigrations(db);
    logger.level = "silent";
  });

  beforeEach(async () => {
    await truncateTables(pool, ["audit_logs", "users", "tenants"]);
  });

  afterAll(async () => {
    await closePool?.();
    await container?.stop();

    if (defaultDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = defaultDatabaseUrl;
    }

    resetModuleGraph();
  });

  it("persists audit log rows", async () => {
    const tenantId = randomUUID();
    const actorUserId = randomUUID();
    const targetId = randomUUID();

    await pool.query(
      "insert into tenants (id, slug, name) values ($1, $2, $3)",
      [tenantId, "tenant-alpha", "Tenant Alpha"],
    );
    await pool.query(
      "insert into users (id, tenant_id, email, password_hash) values ($1, $2, $3, $4)",
      [actorUserId, tenantId, "hello@techbros.test", "password-hash"],
    );

    const service = createAuditLogService({ db });

    await service.record(
      {
        action: "user.updated",
        targetType: "user",
        targetId,
        metadata: {
          changedFields: ["displayName"],
        },
      },
      {
        tenantId,
        actorUserId,
        requestId: "req-audit-123",
        ipAddress: "203.0.113.10",
        userAgent: "Vitest Agent",
      },
    );

    const result = await pool.query<{
      action: string;
      target_type: string | null;
      target_id: string | null;
      tenant_id: string | null;
      actor_user_id: string | null;
      request_id: string | null;
      ip_address: string | null;
      user_agent: string | null;
      metadata: Record<string, unknown>;
    }>(
      `select action, target_type, target_id, tenant_id, actor_user_id, request_id, ip_address, user_agent, metadata
       from audit_logs`,
    );

    expect(result.rows).toEqual([
      {
        action: "user.updated",
        target_type: "user",
        target_id: targetId,
        tenant_id: tenantId,
        actor_user_id: actorUserId,
        request_id: "req-audit-123",
        ip_address: "203.0.113.10",
        user_agent: "Vitest Agent",
        metadata: {
          changedFields: ["displayName"],
        },
      },
    ]);
  });
});

const loadDbClient = async () => import("../../src/db/client.js");

const loadAuditServiceModule = async () =>
  import("../../src/services/audit/index.js");
