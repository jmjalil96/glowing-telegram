import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { tenantsTable } from "./auth.js";
import { clientsTable } from "./clients.js";

export const insurersTable = pgTable(
  "insurers",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("insurers_tenant_id_idx").on(table.tenantId),
    unique("insurers_id_tenant_id_unique").on(table.id, table.tenantId),
    uniqueIndex("insurers_tenant_id_name_unique").on(
      table.tenantId,
      table.name,
    ),
  ],
);

export const policiesTable = pgTable(
  "policies",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull(),
    insurerId: uuid("insurer_id").notNull(),
    policyNumber: text("policy_number").notNull(),
    effectiveDate: date("effective_date").notNull(),
    expirationDate: date("expiration_date"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientId, table.tenantId],
      foreignColumns: [clientsTable.id, clientsTable.tenantId],
      name: "policies_client_tenant_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.insurerId, table.tenantId],
      foreignColumns: [insurersTable.id, insurersTable.tenantId],
      name: "policies_insurer_tenant_fk",
    }).onDelete("restrict"),
    check(
      "policies_date_range_check",
      sql`${table.expirationDate} is null or ${table.expirationDate} >= ${table.effectiveDate}`,
    ),
    unique("policies_id_tenant_client_unique").on(
      table.id,
      table.tenantId,
      table.clientId,
    ),
    index("policies_tenant_id_idx").on(table.tenantId),
    index("policies_client_id_idx").on(table.clientId),
    index("policies_insurer_id_idx").on(table.insurerId),
  ],
);
