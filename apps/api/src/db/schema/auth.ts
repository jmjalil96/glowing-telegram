import { randomUUID } from "node:crypto";

import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const tenantsTable = pgTable("tenants", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  slug: varchar("slug", { length: 128 }).notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const usersTable = pgTable(
  "users",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id),
    email: varchar("email", { length: 320 }).notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("users_tenant_id_idx").on(table.tenantId)],
);

export const sessionsTable = pgTable(
  "sessions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const userTokensTable = pgTable(
  "user_tokens",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id),
    tokenHash: text("token_hash").notNull().unique(),
    type: text("type").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("user_tokens_user_id_idx").on(table.userId),
    index("user_tokens_type_idx").on(table.type),
    index("user_tokens_expires_at_idx").on(table.expiresAt),
  ],
);
