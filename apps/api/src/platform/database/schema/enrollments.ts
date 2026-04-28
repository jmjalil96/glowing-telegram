import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { affiliatesTable } from "./clients.js";
import { policiesTable } from "./policies.js";

export const policyEnrollmentIntakeReasonEnum = pgEnum(
  "policy_enrollment_intake_reason",
  ["initial_load", "new_enrollment", "renewal", "change", "correction"],
);

export const policyEnrollmentOuttakeReasonEnum = pgEnum(
  "policy_enrollment_outtake_reason",
  ["change", "terminated", "policy_end", "correction"],
);

export const policyEnrollmentMemberTypeEnum = pgEnum(
  "policy_enrollment_member_type",
  ["self", "spouse", "child", "other"],
);

export const policyEnrollmentsTable = pgTable(
  "policy_enrollments",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    tenantId: uuid("tenant_id").notNull(),
    clientId: uuid("client_id").notNull(),
    policyId: uuid("policy_id").notNull(),
    primaryAffiliateId: uuid("primary_affiliate_id").notNull(),
    intakeReason: policyEnrollmentIntakeReasonEnum("intake_reason").notNull(),
    outtakeReason: policyEnrollmentOuttakeReasonEnum("outtake_reason"),
    effectiveDate: date("effective_date").notNull(),
    endedOn: date("ended_on"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.policyId, table.tenantId, table.clientId],
      foreignColumns: [
        policiesTable.id,
        policiesTable.tenantId,
        policiesTable.clientId,
      ],
      name: "policy_enrollments_policy_scope_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.primaryAffiliateId, table.tenantId, table.clientId],
      foreignColumns: [
        affiliatesTable.id,
        affiliatesTable.tenantId,
        affiliatesTable.clientId,
      ],
      name: "policy_enrollments_primary_affiliate_scope_fk",
    }).onDelete("restrict"),
    check(
      "policy_enrollments_date_range_check",
      sql`${table.endedOn} is null or ${table.endedOn} >= ${table.effectiveDate}`,
    ),
    unique("policy_enrollments_id_tenant_client_unique").on(
      table.id,
      table.tenantId,
      table.clientId,
    ),
    index("policy_enrollments_policy_id_idx").on(table.policyId),
    index("policy_enrollments_primary_affiliate_id_idx").on(
      table.primaryAffiliateId,
    ),
    index("policy_enrollments_client_id_idx").on(
      table.clientId,
      table.tenantId,
    ),
  ],
);

export const policyEnrollmentMembersTable = pgTable(
  "policy_enrollment_members",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    tenantId: uuid("tenant_id").notNull(),
    clientId: uuid("client_id").notNull(),
    enrollmentId: uuid("enrollment_id").notNull(),
    affiliateId: uuid("affiliate_id").notNull(),
    memberType: policyEnrollmentMemberTypeEnum("member_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.enrollmentId, table.tenantId, table.clientId],
      foreignColumns: [
        policyEnrollmentsTable.id,
        policyEnrollmentsTable.tenantId,
        policyEnrollmentsTable.clientId,
      ],
      name: "policy_enrollment_members_enrollment_scope_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.affiliateId, table.tenantId, table.clientId],
      foreignColumns: [
        affiliatesTable.id,
        affiliatesTable.tenantId,
        affiliatesTable.clientId,
      ],
      name: "policy_enrollment_members_affiliate_scope_fk",
    }).onDelete("restrict"),
    unique("policy_enrollment_members_id_tenant_id_unique").on(
      table.id,
      table.tenantId,
    ),
    uniqueIndex("policy_enrollment_members_enrollment_affiliate_unique").on(
      table.enrollmentId,
      table.affiliateId,
    ),
    index("policy_enrollment_members_affiliate_id_idx").on(
      table.affiliateId,
      table.tenantId,
      table.clientId,
    ),
  ],
);
