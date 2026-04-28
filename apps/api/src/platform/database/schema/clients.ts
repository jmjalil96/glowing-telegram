import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { tenantsTable, usersTable } from "./auth.js";

export const affiliateRelationshipToPrimaryEnum = pgEnum(
  "affiliate_relationship_to_primary",
  ["self", "spouse", "child", "other"],
);

export const clientsTable = pgTable(
  "clients",
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
    index("clients_tenant_id_idx").on(table.tenantId),
    unique("clients_id_tenant_id_unique").on(table.id, table.tenantId),
  ],
);

export const clientUsersTable = pgTable(
  "client_users",
  {
    userId: uuid("user_id").notNull(),
    clientId: uuid("client_id").notNull(),
    tenantId: uuid("tenant_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId, table.tenantId],
      foreignColumns: [usersTable.id, usersTable.tenantId],
      name: "client_users_user_tenant_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.clientId, table.tenantId],
      foreignColumns: [clientsTable.id, clientsTable.tenantId],
      name: "client_users_client_tenant_fk",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.userId, table.clientId] }),
    index("client_users_client_id_idx").on(table.clientId, table.tenantId),
  ],
);

export const affiliatesTable = pgTable(
  "affiliates",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull(),
    primaryAffiliateId: uuid("primary_affiliate_id"),
    userId: uuid("user_id"),
    documentNumber: text("document_number").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    relationshipToPrimary: affiliateRelationshipToPrimaryEnum(
      "relationship_to_primary",
    ).notNull(),
    birthDate: date("birth_date").notNull(),
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
      name: "affiliates_client_tenant_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.primaryAffiliateId, table.tenantId, table.clientId],
      foreignColumns: [table.id, table.tenantId, table.clientId],
      name: "affiliates_primary_affiliate_scope_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.userId, table.tenantId],
      foreignColumns: [usersTable.id, usersTable.tenantId],
      name: "affiliates_user_tenant_fk",
    }).onDelete("restrict"),
    check(
      "affiliates_primary_affiliate_presence_check",
      sql`(
        (${table.relationshipToPrimary} = ${sql.raw("'self'")} and ${table.primaryAffiliateId} is null)
        or
        (${table.relationshipToPrimary} <> ${sql.raw("'self'")} and ${table.primaryAffiliateId} is not null)
      )`,
    ),
    check(
      "affiliates_primary_affiliate_not_self_check",
      sql`${table.primaryAffiliateId} is null or ${table.primaryAffiliateId} <> ${table.id}`,
    ),
    check(
      "affiliates_user_id_self_only_check",
      sql`${table.userId} is null or (
        ${table.relationshipToPrimary} = ${sql.raw("'self'")}
        and ${table.primaryAffiliateId} is null
      )`,
    ),
    index("affiliates_tenant_id_idx").on(table.tenantId),
    index("affiliates_client_id_idx").on(table.clientId),
    index("affiliates_primary_affiliate_id_idx").on(table.primaryAffiliateId),
    uniqueIndex("affiliates_user_id_unique").on(table.userId),
    unique("affiliates_id_tenant_client_unique").on(
      table.id,
      table.tenantId,
      table.clientId,
    ),
  ],
);
