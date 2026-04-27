import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool as PgPool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auditLogsTable } from "../../src/db/schema/audit.js";
import { tenantsTable, usersTable } from "../../src/db/schema/auth.js";
import {
  claimInvoicesTable,
  claimSubmissionHistoryTable,
  claimSubmissionsTable,
  claimsTable,
  claimStatusHistoryTable,
} from "../../src/db/schema/claims.js";
import { affiliatesTable, clientsTable } from "../../src/db/schema/clients.js";
import {
  policyEnrollmentMembersTable,
  policyEnrollmentsTable,
} from "../../src/db/schema/enrollments.js";
import { insurersTable, policiesTable } from "../../src/db/schema/policies.js";
import {
  runMigrationsForConnectionString,
  startTestDatabase,
  type TestDatabase,
} from "../helpers/database.js";

const migrationsFolder = fileURLToPath(
  new URL("../../src/db/migrations", import.meta.url),
);

const legacyMigrationFiles = [
  "0000_create-users.sql",
  "0001_brown_wolfpack.sql",
  "0002_careful_pestilence.sql",
  "0003_damp_manta.sql",
  "0004_exotic_the_hood.sql",
  "0005_loose_cable.sql",
] as const;

const scopeMigrationFile = "0006_tenant_scope.sql";

const createScopedDb = (pool: PgPool) =>
  drizzle({
    client: pool,
    schema: {
      affiliatesTable,
      auditLogsTable,
      claimInvoicesTable,
      claimSubmissionHistoryTable,
      claimSubmissionsTable,
      claimsTable,
      claimStatusHistoryTable,
      clientsTable,
      insurersTable,
      policiesTable,
      policyEnrollmentMembersTable,
      policyEnrollmentsTable,
      tenantsTable,
      usersTable,
    },
  });

type ScopedDb = ReturnType<typeof createScopedDb>;

interface TenantFixture {
  affiliateId: string;
  clientId: string;
  enrollmentId: string;
  insurerId: string;
  memberId: string;
  policyId: string;
  tenantId: string;
  userId: string;
}

const expectConstraintViolation = async (
  operation: Promise<unknown>,
  constraintPattern: RegExp,
): Promise<void> => {
  try {
    await operation;
  } catch (error) {
    const details = [
      error instanceof Error ? error.message : String(error),
      error instanceof Error && error.cause instanceof Error
        ? error.cause.message
        : "",
    ]
      .filter((detail) => detail.length > 0)
      .join("\n");

    expect(details).toMatch(constraintPattern);

    return;
  }

  throw new Error("Expected query to fail with a constraint violation");
};

const executeMigrationFile = async (
  pool: PgPool,
  fileName: string,
): Promise<void> => {
  const sql = readFileSync(join(migrationsFolder, fileName), "utf8");
  const statements = sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  for (const statement of statements) {
    await pool.query(statement);
  }
};

const createTenantFixture = async (
  db: ScopedDb,
  label: string,
): Promise<TenantFixture> => {
  const suffix = label.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  const [tenant] = await db
    .insert(tenantsTable)
    .values({
      name: `Tenant ${label}`,
      slug: `tenant-${suffix}-${randomUUID()}`,
    })
    .returning({
      id: tenantsTable.id,
    });

  if (!tenant) {
    throw new Error("Expected tenant to be created");
  }

  const [user] = await db
    .insert(usersTable)
    .values({
      tenantId: tenant.id,
      email: `${suffix}-${randomUUID()}@example.com`,
      passwordHash: "hash",
    })
    .returning({
      id: usersTable.id,
      tenantId: usersTable.tenantId,
    });

  if (!user) {
    throw new Error("Expected user to be created");
  }

  const [client] = await db
    .insert(clientsTable)
    .values({
      tenantId: tenant.id,
      name: `Client ${label}`,
    })
    .returning({
      id: clientsTable.id,
    });

  if (!client) {
    throw new Error("Expected client to be created");
  }

  const [insurer] = await db
    .insert(insurersTable)
    .values({
      tenantId: tenant.id,
      name: `Insurer ${label}`,
    })
    .returning({
      id: insurersTable.id,
    });

  if (!insurer) {
    throw new Error("Expected insurer to be created");
  }

  const [affiliate] = await db
    .insert(affiliatesTable)
    .values({
      tenantId: tenant.id,
      clientId: client.id,
      userId: user.id,
      documentNumber: randomUUID(),
      firstName: "Primary",
      lastName: label,
      relationshipToPrimary: "self",
      birthDate: "1990-01-01",
    })
    .returning({
      id: affiliatesTable.id,
    });

  if (!affiliate) {
    throw new Error("Expected affiliate to be created");
  }

  const [policy] = await db
    .insert(policiesTable)
    .values({
      tenantId: tenant.id,
      clientId: client.id,
      insurerId: insurer.id,
      policyNumber: `policy-${suffix}-${randomUUID()}`,
      effectiveDate: "2025-01-01",
    })
    .returning({
      id: policiesTable.id,
    });

  if (!policy) {
    throw new Error("Expected policy to be created");
  }

  const [enrollment] = await db
    .insert(policyEnrollmentsTable)
    .values({
      tenantId: tenant.id,
      clientId: client.id,
      policyId: policy.id,
      primaryAffiliateId: affiliate.id,
      intakeReason: "new_enrollment",
      effectiveDate: "2025-01-01",
    })
    .returning({
      id: policyEnrollmentsTable.id,
    });

  if (!enrollment) {
    throw new Error("Expected enrollment to be created");
  }

  const [member] = await db
    .insert(policyEnrollmentMembersTable)
    .values({
      tenantId: tenant.id,
      clientId: client.id,
      enrollmentId: enrollment.id,
      affiliateId: affiliate.id,
      memberType: "self",
    })
    .returning({
      id: policyEnrollmentMembersTable.id,
      tenantId: policyEnrollmentMembersTable.tenantId,
    });

  if (!member) {
    throw new Error("Expected enrollment member to be created");
  }

  return {
    affiliateId: affiliate.id,
    clientId: client.id,
    enrollmentId: enrollment.id,
    insurerId: insurer.id,
    memberId: member.id,
    policyId: policy.id,
    tenantId: member.tenantId,
    userId: user.id,
  };
};

describe("claim and audit scope migration", () => {
  let testDatabase: TestDatabase | undefined;
  let pool: PgPool | undefined;

  beforeAll(async () => {
    testDatabase = await startTestDatabase();
    pool = new PgPool({
      connectionString: testDatabase.connectionString,
    });

    for (const fileName of legacyMigrationFiles) {
      await executeMigrationFile(pool, fileName);
    }
  });

  afterAll(async () => {
    await pool?.end();
    await testDatabase?.stop();
  });

  it("backfills tenant scope for existing claim and audit rows", async () => {
    if (!pool) {
      throw new Error("Expected test pool to be initialized");
    }

    const tenantId = randomUUID();
    const userId = randomUUID();
    const clientId = randomUUID();
    const insurerId = randomUUID();
    const affiliateId = randomUUID();
    const policyId = randomUUID();
    const enrollmentId = randomUUID();
    const memberId = randomUUID();
    const claimId = randomUUID();
    const claimSubmissionId = randomUUID();
    const claimStatusHistoryId = randomUUID();
    const claimSubmissionHistoryId = randomUUID();
    const slugSuffix = randomUUID();

    await pool.query(
      `insert into "tenants" ("id", "slug", "name")
       values ($1, $2, $3)`,
      [tenantId, `tenant-${slugSuffix}`, "Legacy Tenant"],
    );
    await pool.query(
      `insert into "users" ("id", "tenant_id", "email", "password_hash")
       values ($1, $2, $3, $4)`,
      [userId, tenantId, `legacy-${slugSuffix}@example.com`, "hash"],
    );
    await pool.query(
      `insert into "clients" ("id", "tenant_id", "name")
       values ($1, $2, $3)`,
      [clientId, tenantId, "Legacy Client"],
    );
    await pool.query(
      `insert into "insurers" ("id", "tenant_id", "name")
       values ($1, $2, $3)`,
      [insurerId, tenantId, "Legacy Insurer"],
    );
    await pool.query(
      `insert into "affiliates" (
         "id",
         "tenant_id",
         "client_id",
         "user_id",
         "document_number",
         "first_name",
         "last_name",
         "relationship_to_primary",
         "birth_date"
       )
       values ($1, $2, $3, $4, $5, $6, $7, 'self', $8)`,
      [
        affiliateId,
        tenantId,
        clientId,
        userId,
        `doc-${slugSuffix}`,
        "Legacy",
        "Primary",
        "1990-01-01",
      ],
    );
    await pool.query(
      `insert into "policies" (
         "id",
         "tenant_id",
         "client_id",
         "insurer_id",
         "policy_number",
         "effective_date"
       )
       values ($1, $2, $3, $4, $5, $6)`,
      [
        policyId,
        tenantId,
        clientId,
        insurerId,
        `policy-${slugSuffix}`,
        "2025-01-01",
      ],
    );
    await pool.query(
      `insert into "policy_enrollments" (
         "id",
         "tenant_id",
         "client_id",
         "policy_id",
         "primary_affiliate_id",
         "intake_reason",
         "effective_date"
       )
       values ($1, $2, $3, $4, $5, 'new_enrollment', $6)`,
      [enrollmentId, tenantId, clientId, policyId, affiliateId, "2025-01-01"],
    );
    await pool.query(
      `insert into "policy_enrollment_members" (
         "id",
         "tenant_id",
         "client_id",
         "enrollment_id",
         "affiliate_id"
       )
       values ($1, $2, $3, $4, $5)`,
      [memberId, tenantId, clientId, enrollmentId, affiliateId],
    );
    await pool.query(
      `insert into "claims" (
         "id",
         "claim_number",
         "status",
         "enrollment_member_id",
         "event_date",
         "attention_type",
         "submitted_amount"
       )
       values ($1, $2, 'internal_review', $3, $4, 'other', $5)`,
      [claimId, `claim-${slugSuffix}`, memberId, "2025-02-01", "100.00"],
    );
    await pool.query(
      `insert into "claim_submissions" (
         "id",
         "enrollment_member_id",
         "diagnosis_other_text",
         "submitted_by_user_id",
         "claim_id"
       )
       values ($1, $2, $3, $4, $5)`,
      [claimSubmissionId, memberId, "Legacy diagnosis", userId, claimId],
    );
    await pool.query(
      `insert into "claim_status_history" (
         "id",
         "claim_id",
         "to_status",
         "changed_by_user_id"
       )
       values ($1, $2, 'submitted_to_insurer', $3)`,
      [claimStatusHistoryId, claimId, userId],
    );
    await pool.query(
      `insert into "claim_submission_history" (
         "id",
         "claim_submission_id",
         "to_status",
         "changed_by_user_id"
       )
       values ($1, $2, 'converted', $3)`,
      [claimSubmissionHistoryId, claimSubmissionId, userId],
    );
    await pool.query(
      `insert into "audit_logs" ("tenant_id", "actor_user_id", "action")
       values ($1, $2, $3)`,
      [tenantId, userId, "migration.actor"],
    );
    await pool.query(
      `insert into "audit_logs" ("action")
       values ($1)`,
      ["migration.system"],
    );

    await executeMigrationFile(pool, scopeMigrationFile);

    const claimsRows = await pool.query<{ tenant_id: string }>(
      `select "tenant_id" from "claims" where "id" = $1`,
      [claimId],
    );
    const claimSubmissionRows = await pool.query<{ tenant_id: string }>(
      `select "tenant_id" from "claim_submissions" where "id" = $1`,
      [claimSubmissionId],
    );
    const claimStatusHistoryRows = await pool.query<{ tenant_id: string }>(
      `select "tenant_id" from "claim_status_history" where "id" = $1`,
      [claimStatusHistoryId],
    );
    const claimSubmissionHistoryRows = await pool.query<{ tenant_id: string }>(
      `select "tenant_id" from "claim_submission_history" where "id" = $1`,
      [claimSubmissionHistoryId],
    );
    const auditActorRows = await pool.query<{
      actor_user_id: string | null;
      tenant_id: string | null;
    }>(
      `select "tenant_id", "actor_user_id"
       from "audit_logs"
       where "action" = 'migration.actor'`,
    );
    const auditSystemRows = await pool.query<{
      actor_user_id: string | null;
      tenant_id: string | null;
    }>(
      `select "tenant_id", "actor_user_id"
       from "audit_logs"
       where "action" = 'migration.system'`,
    );

    expect(claimsRows.rows[0]?.tenant_id).toBe(tenantId);
    expect(claimSubmissionRows.rows[0]?.tenant_id).toBe(tenantId);
    expect(claimStatusHistoryRows.rows[0]?.tenant_id).toBe(tenantId);
    expect(claimSubmissionHistoryRows.rows[0]?.tenant_id).toBe(tenantId);
    expect(auditActorRows.rows[0]).toEqual({
      actor_user_id: userId,
      tenant_id: tenantId,
    });
    expect(auditSystemRows.rows[0]).toEqual({
      actor_user_id: null,
      tenant_id: null,
    });
  });
});

describe("claim and audit tenant constraints", () => {
  let db: ScopedDb | undefined;
  let pool: PgPool | undefined;
  let testDatabase: TestDatabase | undefined;

  beforeAll(async () => {
    testDatabase = await startTestDatabase();
    await runMigrationsForConnectionString(testDatabase.connectionString);

    pool = new PgPool({
      connectionString: testDatabase.connectionString,
    });
    db = createScopedDb(pool);
  });

  afterAll(async () => {
    await pool?.end();
    await testDatabase?.stop();
  });

  it("allows same-tenant claim rows and rejects cross-tenant submissions", async () => {
    if (!db) {
      throw new Error("Expected test database client to be initialized");
    }

    const tenantA = await createTenantFixture(db, "claims-tenant-a");
    const tenantB = await createTenantFixture(db, "claims-tenant-b");
    const [claimA] = await db
      .insert(claimsTable)
      .values({
        tenantId: tenantA.tenantId,
        claimNumber: `claim-a-${randomUUID()}`,
        status: "internal_review",
        enrollmentMemberId: tenantA.memberId,
        eventDate: "2025-02-01",
        attentionType: "other",
        submittedAmount: "100.00",
      })
      .returning({
        id: claimsTable.id,
      });
    const [claimB] = await db
      .insert(claimsTable)
      .values({
        tenantId: tenantB.tenantId,
        claimNumber: `claim-b-${randomUUID()}`,
        status: "internal_review",
        enrollmentMemberId: tenantB.memberId,
        eventDate: "2025-02-01",
        attentionType: "other",
        submittedAmount: "100.00",
      })
      .returning({
        id: claimsTable.id,
      });

    expect(claimA).toBeTruthy();
    expect(claimB).toBeTruthy();

    await expectConstraintViolation(
      db.insert(claimSubmissionsTable).values({
        tenantId: tenantA.tenantId,
        enrollmentMemberId: tenantA.memberId,
        diagnosisOtherText: "Cross-tenant submitter",
        submittedByUserId: tenantB.userId,
      }),
      /claim_submissions_submitted_by_user_tenant_fk/,
    );

    await expectConstraintViolation(
      db.insert(claimSubmissionsTable).values({
        tenantId: tenantA.tenantId,
        enrollmentMemberId: tenantA.memberId,
        diagnosisOtherText: "Cross-tenant claim link",
        submittedByUserId: tenantA.userId,
        claimId: claimB?.id,
      }),
      /claim_submissions_claim_tenant_fk/,
    );

    const [sameTenantSubmission] = await db
      .insert(claimSubmissionsTable)
      .values({
        tenantId: tenantA.tenantId,
        enrollmentMemberId: tenantA.memberId,
        diagnosisOtherText: "Same-tenant claim submission",
        submittedByUserId: tenantA.userId,
        claimId: claimA?.id,
      })
      .returning({
        id: claimSubmissionsTable.id,
        tenantId: claimSubmissionsTable.tenantId,
      });

    expect(sameTenantSubmission?.id).toEqual(expect.any(String));
    expect(sameTenantSubmission?.tenantId).toBe(tenantA.tenantId);
  });

  it("allows same-tenant claim invoices and rejects cross-tenant claim links", async () => {
    if (!db) {
      throw new Error("Expected test database client to be initialized");
    }

    const tenantA = await createTenantFixture(db, "invoice-tenant-a");
    const tenantB = await createTenantFixture(db, "invoice-tenant-b");
    const [claimA] = await db
      .insert(claimsTable)
      .values({
        tenantId: tenantA.tenantId,
        claimNumber: `claim-invoice-a-${randomUUID()}`,
        status: "internal_review",
        enrollmentMemberId: tenantA.memberId,
        eventDate: "2025-02-01",
        attentionType: "other",
        submittedAmount: "100.00",
      })
      .returning({
        id: claimsTable.id,
      });
    const [claimB] = await db
      .insert(claimsTable)
      .values({
        tenantId: tenantB.tenantId,
        claimNumber: `claim-invoice-b-${randomUUID()}`,
        status: "internal_review",
        enrollmentMemberId: tenantB.memberId,
        eventDate: "2025-02-01",
        attentionType: "other",
        submittedAmount: "100.00",
      })
      .returning({
        id: claimsTable.id,
      });

    const invoiceNumber = `invoice-${randomUUID()}`;
    const [sameTenantInvoice] = await db
      .insert(claimInvoicesTable)
      .values({
        tenantId: tenantA.tenantId,
        claimId: claimA?.id ?? "",
        invoiceNumber,
        provider: "Same Tenant Provider",
        value: "50.00",
      })
      .returning({
        id: claimInvoicesTable.id,
        tenantId: claimInvoicesTable.tenantId,
      });

    expect(sameTenantInvoice?.id).toEqual(expect.any(String));
    expect(sameTenantInvoice?.tenantId).toBe(tenantA.tenantId);

    await expectConstraintViolation(
      db.insert(claimInvoicesTable).values({
        tenantId: tenantA.tenantId,
        claimId: claimB?.id ?? "",
        invoiceNumber: `cross-tenant-invoice-${randomUUID()}`,
        provider: "Cross Tenant Provider",
        value: "25.00",
      }),
      /claim_invoices_claim_tenant_fk/,
    );

    await expectConstraintViolation(
      db.insert(claimInvoicesTable).values({
        tenantId: tenantA.tenantId,
        claimId: claimA?.id ?? "",
        invoiceNumber,
        provider: "Duplicate Provider",
        value: "10.00",
      }),
      /claim_invoices_claim_invoice_number_unique/,
    );
  });

  it("allows same-tenant history rows and rejects cross-tenant history actors", async () => {
    if (!db) {
      throw new Error("Expected test database client to be initialized");
    }

    const tenantA = await createTenantFixture(db, "history-tenant-a");
    const tenantB = await createTenantFixture(db, "history-tenant-b");
    const [claim] = await db
      .insert(claimsTable)
      .values({
        tenantId: tenantA.tenantId,
        claimNumber: `claim-history-${randomUUID()}`,
        status: "internal_review",
        enrollmentMemberId: tenantA.memberId,
        eventDate: "2025-02-01",
        attentionType: "other",
        submittedAmount: "100.00",
      })
      .returning({
        id: claimsTable.id,
      });
    const [submission] = await db
      .insert(claimSubmissionsTable)
      .values({
        tenantId: tenantA.tenantId,
        enrollmentMemberId: tenantA.memberId,
        diagnosisOtherText: "History submission",
        submittedByUserId: tenantA.userId,
        claimId: claim?.id,
      })
      .returning({
        id: claimSubmissionsTable.id,
      });

    const [claimHistory] = await db
      .insert(claimStatusHistoryTable)
      .values({
        tenantId: tenantA.tenantId,
        claimId: claim?.id ?? "",
        toStatus: "submitted_to_insurer",
        changedByUserId: tenantA.userId,
      })
      .returning({
        id: claimStatusHistoryTable.id,
        tenantId: claimStatusHistoryTable.tenantId,
      });
    const [submissionHistory] = await db
      .insert(claimSubmissionHistoryTable)
      .values({
        tenantId: tenantA.tenantId,
        claimSubmissionId: submission?.id ?? "",
        toStatus: "converted",
        changedByUserId: tenantA.userId,
      })
      .returning({
        id: claimSubmissionHistoryTable.id,
        tenantId: claimSubmissionHistoryTable.tenantId,
      });

    expect(claimHistory?.id).toEqual(expect.any(String));
    expect(claimHistory?.tenantId).toBe(tenantA.tenantId);
    expect(submissionHistory?.id).toEqual(expect.any(String));
    expect(submissionHistory?.tenantId).toBe(tenantA.tenantId);

    await expectConstraintViolation(
      db.insert(claimStatusHistoryTable).values({
        tenantId: tenantA.tenantId,
        claimId: claim?.id ?? "",
        toStatus: "pending_information",
        changedByUserId: tenantB.userId,
      }),
      /claim_status_history_changed_by_user_tenant_fk/,
    );

    await expectConstraintViolation(
      db.insert(claimSubmissionHistoryTable).values({
        tenantId: tenantA.tenantId,
        claimSubmissionId: submission?.id ?? "",
        toStatus: "cancelled",
        changedByUserId: tenantB.userId,
      }),
      /claim_submission_history_changed_by_user_tenant_fk/,
    );
  });

  it("allows same-tenant audit rows, allows actorless system rows, and rejects mismatched actors", async () => {
    if (!db) {
      throw new Error("Expected test database client to be initialized");
    }

    const tenantA = await createTenantFixture(db, "audit-tenant-a");
    const tenantB = await createTenantFixture(db, "audit-tenant-b");
    const [sameTenantAudit] = await db
      .insert(auditLogsTable)
      .values({
        tenantId: tenantA.tenantId,
        actorUserId: tenantA.userId,
        action: `audit-same-tenant-${randomUUID()}`,
      })
      .returning({
        actorUserId: auditLogsTable.actorUserId,
        tenantId: auditLogsTable.tenantId,
      });
    const [actorlessAudit] = await db
      .insert(auditLogsTable)
      .values({
        action: `audit-system-${randomUUID()}`,
      })
      .returning({
        actorUserId: auditLogsTable.actorUserId,
        tenantId: auditLogsTable.tenantId,
      });

    expect(sameTenantAudit).toEqual({
      actorUserId: tenantA.userId,
      tenantId: tenantA.tenantId,
    });
    expect(actorlessAudit).toEqual({
      actorUserId: null,
      tenantId: null,
    });

    await expectConstraintViolation(
      db.insert(auditLogsTable).values({
        tenantId: tenantA.tenantId,
        actorUserId: tenantB.userId,
        action: `audit-cross-tenant-${randomUUID()}`,
      }),
      /audit_logs_actor_user_tenant_fk/,
    );

    await expectConstraintViolation(
      db.insert(auditLogsTable).values({
        actorUserId: tenantA.userId,
        action: `audit-missing-tenant-${randomUUID()}`,
      }),
      /audit_logs_actor_requires_tenant_check/,
    );
  });
});
