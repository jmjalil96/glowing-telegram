import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { tenantsTable, usersTable } from "./auth.js";

export const auditLogsTable = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenantsTable.id, {
      onDelete: "set null",
    }),
    actorUserId: uuid("actor_user_id"),
    action: varchar("action", { length: 128 }).notNull(),
    targetType: varchar("target_type", { length: 64 }),
    targetId: uuid("target_id"),
    requestId: varchar("request_id", { length: 255 }),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.actorUserId, table.tenantId],
      foreignColumns: [usersTable.id, usersTable.tenantId],
      name: "audit_logs_actor_user_tenant_fk",
    }).onDelete("set null"),
    check(
      "audit_logs_actor_requires_tenant_check",
      sql`${table.actorUserId} is null or ${table.tenantId} is not null`,
    ),
    index("audit_logs_tenant_id_idx").on(table.tenantId),
    index("audit_logs_actor_user_id_idx").on(table.actorUserId),
    index("audit_logs_action_idx").on(table.action),
    index("audit_logs_created_at_idx").on(table.createdAt),
    index("audit_logs_target_idx").on(table.targetType, table.targetId),
  ],
);
