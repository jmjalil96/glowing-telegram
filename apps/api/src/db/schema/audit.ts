import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
  text,
} from "drizzle-orm/pg-core";

import { tenantsTable, usersTable } from "./auth.js";

export const auditLogsTable = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenantsTable.id, {
      onDelete: "set null",
    }),
    actorUserId: uuid("actor_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
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
    index("audit_logs_tenant_id_idx").on(table.tenantId),
    index("audit_logs_actor_user_id_idx").on(table.actorUserId),
    index("audit_logs_action_idx").on(table.action),
    index("audit_logs_created_at_idx").on(table.createdAt),
    index("audit_logs_target_idx").on(table.targetType, table.targetId),
  ],
);
