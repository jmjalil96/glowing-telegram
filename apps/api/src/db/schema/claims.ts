import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { usersTable } from "./auth.js";
import { diagnosesTable } from "./diagnoses.js";
import { policyEnrollmentMembersTable } from "./enrollments.js";

export const claimStatusEnum = pgEnum("claim_status", [
  "internal_review",
  "submitted_to_insurer",
  "pending_information",
  "not_processed",
  "settled",
  "cancelled",
]);

export const claimAttentionTypeEnum = pgEnum("claim_attention_type", [
  "ambulatory",
  "hospitalary",
  "emergency",
  "pharmacy",
  "dental",
  "other",
]);

export const claimSubmissionStatusEnum = pgEnum("claim_submission_status", [
  "submitted",
  "converted",
  "not_converted",
  "cancelled",
]);

export const claimsTable = pgTable(
  "claims",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    tenantId: uuid("tenant_id").notNull(),
    claimNumber: text("claim_number").notNull(),
    status: claimStatusEnum("status").notNull(),
    enrollmentMemberId: uuid("enrollment_member_id").notNull(),
    intakeSubmittedAt: timestamp("intake_submitted_at", {
      withTimezone: true,
    }),
    sentToInsurerAt: timestamp("sent_to_insurer_at", {
      withTimezone: true,
    }),
    eventDate: date("event_date").notNull(),
    attentionType: claimAttentionTypeEnum("attention_type").notNull(),
    diagnosisId: uuid("diagnosis_id").references(() => diagnosesTable.id, {
      onDelete: "restrict",
    }),
    diagnosisOtherText: text("diagnosis_other_text"),
    description: text("description"),
    submittedAmount: numeric("submitted_amount", {
      precision: 12,
      scale: 2,
    }).notNull(),
    notEligibleAmount: numeric("not_eligible_amount", {
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default("0"),
    notProcessedAmount: numeric("not_processed_amount", {
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default("0"),
    copayAmount: numeric("copay_amount", {
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default("0"),
    deductibleAmount: numeric("deductible_amount", {
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default("0"),
    paidAmount: numeric("paid_amount", {
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default("0"),
    settlementNumber: text("settlement_number"),
    settlementDate: date("settlement_date"),
    settlementNotes: text("settlement_notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.enrollmentMemberId, table.tenantId],
      foreignColumns: [
        policyEnrollmentMembersTable.id,
        policyEnrollmentMembersTable.tenantId,
      ],
      name: "claims_enrollment_member_tenant_fk",
    }).onDelete("restrict"),
    check(
      "claims_non_negative_amounts_check",
      sql`${table.submittedAmount} >= 0
        and ${table.notEligibleAmount} >= 0
        and ${table.notProcessedAmount} >= 0
        and ${table.copayAmount} >= 0
        and ${table.deductibleAmount} >= 0
        and ${table.paidAmount} >= 0`,
    ),
    check(
      "claims_paid_amount_lte_submitted_amount_check",
      sql`${table.paidAmount} <= ${table.submittedAmount}`,
    ),
    check(
      "claims_diagnosis_source_check",
      sql`${table.diagnosisId} is null or ${table.diagnosisOtherText} is null`,
    ),
    unique("claims_id_tenant_id_unique").on(table.id, table.tenantId),
    uniqueIndex("claims_claim_number_unique").on(table.claimNumber),
    index("claims_tenant_id_idx").on(table.tenantId),
    index("claims_status_idx").on(table.status),
    index("claims_enrollment_member_id_idx").on(table.enrollmentMemberId),
    index("claims_diagnosis_id_idx").on(table.diagnosisId),
    index("claims_event_date_idx").on(table.eventDate),
    index("claims_sent_to_insurer_at_idx").on(table.sentToInsurerAt),
  ],
);

export const claimStatusHistoryTable = pgTable(
  "claim_status_history",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    tenantId: uuid("tenant_id").notNull(),
    claimId: uuid("claim_id").notNull(),
    fromStatus: claimStatusEnum("from_status"),
    toStatus: claimStatusEnum("to_status").notNull(),
    note: text("note"),
    changedByUserId: uuid("changed_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.claimId, table.tenantId],
      foreignColumns: [claimsTable.id, claimsTable.tenantId],
      name: "claim_status_history_claim_tenant_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.changedByUserId, table.tenantId],
      foreignColumns: [usersTable.id, usersTable.tenantId],
      name: "claim_status_history_changed_by_user_tenant_fk",
    }).onDelete("set null"),
    index("claim_status_history_tenant_id_idx").on(table.tenantId),
    index("claim_status_history_claim_id_idx").on(table.claimId),
    index("claim_status_history_to_status_idx").on(table.toStatus),
    index("claim_status_history_created_at_idx").on(table.createdAt),
  ],
);

export const claimInvoicesTable = pgTable(
  "claim_invoices",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    tenantId: uuid("tenant_id").notNull(),
    claimId: uuid("claim_id").notNull(),
    invoiceNumber: text("invoice_number").notNull(),
    provider: text("provider").notNull(),
    value: numeric("value", {
      precision: 12,
      scale: 2,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.claimId, table.tenantId],
      foreignColumns: [claimsTable.id, claimsTable.tenantId],
      name: "claim_invoices_claim_tenant_fk",
    }).onDelete("cascade"),
    check("claim_invoices_value_non_negative_check", sql`${table.value} >= 0`),
    unique("claim_invoices_id_tenant_id_unique").on(table.id, table.tenantId),
    index("claim_invoices_tenant_id_idx").on(table.tenantId),
    index("claim_invoices_claim_id_idx").on(table.claimId),
    uniqueIndex("claim_invoices_claim_invoice_number_unique").on(
      table.claimId,
      table.invoiceNumber,
    ),
  ],
);

export const claimSubmissionsTable = pgTable(
  "claim_submissions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    tenantId: uuid("tenant_id").notNull(),
    enrollmentMemberId: uuid("enrollment_member_id").notNull(),
    diagnosisId: uuid("diagnosis_id").references(() => diagnosesTable.id, {
      onDelete: "restrict",
    }),
    diagnosisOtherText: text("diagnosis_other_text"),
    description: text("description"),
    status: claimSubmissionStatusEnum("status").notNull().default("submitted"),
    submittedByUserId: uuid("submitted_by_user_id").notNull(),
    claimId: uuid("claim_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.enrollmentMemberId, table.tenantId],
      foreignColumns: [
        policyEnrollmentMembersTable.id,
        policyEnrollmentMembersTable.tenantId,
      ],
      name: "claim_submissions_enrollment_member_tenant_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.submittedByUserId, table.tenantId],
      foreignColumns: [usersTable.id, usersTable.tenantId],
      name: "claim_submissions_submitted_by_user_tenant_fk",
    }),
    foreignKey({
      columns: [table.claimId, table.tenantId],
      foreignColumns: [claimsTable.id, claimsTable.tenantId],
      name: "claim_submissions_claim_tenant_fk",
    }).onDelete("set null"),
    check(
      "claim_submissions_diagnosis_presence_check",
      sql`(
        (${table.diagnosisId} is not null and ${table.diagnosisOtherText} is null)
        or
        (${table.diagnosisId} is null and ${table.diagnosisOtherText} is not null)
      )`,
    ),
    unique("claim_submissions_id_tenant_id_unique").on(
      table.id,
      table.tenantId,
    ),
    uniqueIndex("claim_submissions_claim_id_unique").on(table.claimId),
    index("claim_submissions_tenant_id_idx").on(table.tenantId),
    index("claim_submissions_status_idx").on(table.status),
    index("claim_submissions_enrollment_member_id_idx").on(
      table.enrollmentMemberId,
    ),
    index("claim_submissions_diagnosis_id_idx").on(table.diagnosisId),
    index("claim_submissions_submitted_by_user_id_idx").on(
      table.submittedByUserId,
    ),
  ],
);

export const claimSubmissionHistoryTable = pgTable(
  "claim_submission_history",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    tenantId: uuid("tenant_id").notNull(),
    claimSubmissionId: uuid("claim_submission_id").notNull(),
    fromStatus: claimSubmissionStatusEnum("from_status"),
    toStatus: claimSubmissionStatusEnum("to_status").notNull(),
    note: text("note"),
    changedByUserId: uuid("changed_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.claimSubmissionId, table.tenantId],
      foreignColumns: [
        claimSubmissionsTable.id,
        claimSubmissionsTable.tenantId,
      ],
      name: "claim_submission_history_submission_tenant_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.changedByUserId, table.tenantId],
      foreignColumns: [usersTable.id, usersTable.tenantId],
      name: "claim_submission_history_changed_by_user_tenant_fk",
    }).onDelete("set null"),
    index("claim_submission_history_tenant_id_idx").on(table.tenantId),
    index("claim_submission_history_submission_id_idx").on(
      table.claimSubmissionId,
    ),
    index("claim_submission_history_to_status_idx").on(table.toStatus),
    index("claim_submission_history_created_at_idx").on(table.createdAt),
  ],
);
