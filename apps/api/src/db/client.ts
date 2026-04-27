import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";

import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { auditLogsTable } from "./schema/audit.js";
import {
  sessionsTable,
  tenantsTable,
  userTokensTable,
  usersTable,
} from "./schema/auth.js";
import {
  claimInvoicesTable,
  claimSubmissionHistoryTable,
  claimSubmissionsTable,
  claimsTable,
  claimStatusHistoryTable,
} from "./schema/claims.js";
import {
  affiliatesTable,
  clientUsersTable,
  clientsTable,
} from "./schema/clients.js";
import { diagnosesTable } from "./schema/diagnoses.js";
import {
  policyEnrollmentMembersTable,
  policyEnrollmentsTable,
} from "./schema/enrollments.js";
import { insurersTable, policiesTable } from "./schema/policies.js";
import {
  permissionsTable,
  rolePermissionsTable,
  rolesTable,
  userRolesTable,
} from "./schema/rbac.js";

const READINESS_QUERY_TIMEOUT_MS = 1_000;
const DRIZZLE_MIGRATIONS_SCHEMA = "drizzle";
const DRIZZLE_MIGRATIONS_TABLE = "__drizzle_migrations";

interface MigrationJournalEntry {
  when: number;
}

interface MigrationJournal {
  entries: MigrationJournalEntry[];
}

let expectedDatabaseMigrationVersion: number | null = null;

export const poolConfig = Object.freeze({
  connectionString: env.DATABASE_URL,
  max: env.PG_POOL_MAX,
  idleTimeoutMillis: env.PG_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: env.PG_CONNECT_TIMEOUT_MS,
});

export const pool = new Pool(poolConfig);

pool.on("error", (error) => {
  logger.error({ err: error }, "Unexpected PostgreSQL pool error");
});

export const db = drizzle({
  client: pool,
  schema: {
    affiliatesTable,
    auditLogsTable,
    claimInvoicesTable,
    claimSubmissionHistoryTable,
    claimSubmissionsTable,
    claimsTable,
    claimStatusHistoryTable,
    clientUsersTable,
    clientsTable,
    diagnosesTable,
    insurersTable,
    permissionsTable,
    policiesTable,
    policyEnrollmentMembersTable,
    policyEnrollmentsTable,
    rolePermissionsTable,
    rolesTable,
    sessionsTable,
    tenantsTable,
    userTokensTable,
    userRolesTable,
    usersTable,
  },
});

export const createReadinessClient = (): Client =>
  new Client({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: env.PG_CONNECT_TIMEOUT_MS,
    query_timeout: READINESS_QUERY_TIMEOUT_MS,
  });

const getMigrationJournalPath = (): string => {
  const candidates = [
    new URL("./migrations/meta/_journal.json", import.meta.url),
    new URL("../../src/db/migrations/meta/_journal.json", import.meta.url),
  ];

  for (const candidate of candidates) {
    const path = fileURLToPath(candidate);

    if (existsSync(path)) {
      return path;
    }
  }

  throw new Error("Failed to locate Drizzle migration journal");
};

const parseMigrationJournal = (rawJournal: string): MigrationJournal => {
  const parsedJournal: unknown = JSON.parse(rawJournal);

  if (
    typeof parsedJournal !== "object" ||
    parsedJournal === null ||
    !("entries" in parsedJournal) ||
    !Array.isArray(parsedJournal.entries)
  ) {
    throw new Error("Invalid Drizzle migration journal");
  }

  const entries = parsedJournal.entries.map((entry: unknown) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("when" in entry) ||
      typeof entry.when !== "number"
    ) {
      throw new Error("Invalid Drizzle migration journal entry");
    }

    return {
      when: entry.when,
    };
  });

  return {
    entries,
  };
};

const getExpectedDatabaseMigrationVersion = (): number => {
  if (expectedDatabaseMigrationVersion !== null) {
    return expectedDatabaseMigrationVersion;
  }

  const migrationJournalPath = getMigrationJournalPath();
  const migrationJournal = parseMigrationJournal(
    readFileSync(migrationJournalPath, "utf8"),
  );
  const latestMigrationEntry = migrationJournal.entries.at(-1);

  if (!latestMigrationEntry) {
    throw new Error("Drizzle migration journal has no entries");
  }

  expectedDatabaseMigrationVersion = latestMigrationEntry.when;

  return expectedDatabaseMigrationVersion;
};

const getAppliedDatabaseMigrationVersion = async (
  readinessClient: Client,
): Promise<number | null> => {
  const result = await readinessClient.query<{
    created_at: number | string;
  }>(
    `select created_at from "${DRIZZLE_MIGRATIONS_SCHEMA}"."${DRIZZLE_MIGRATIONS_TABLE}" order by created_at desc limit 1`,
  );
  const latestMigration = result.rows[0];

  if (!latestMigration) {
    return null;
  }

  const parsedMigrationVersion = Number(latestMigration.created_at);

  if (!Number.isSafeInteger(parsedMigrationVersion)) {
    throw new Error("Invalid applied Drizzle migration version");
  }

  return parsedMigrationVersion;
};

export const verifyDatabaseOperationalReadiness = async (): Promise<void> => {
  const readinessClient = createReadinessClient();

  try {
    await readinessClient.connect();
    const expectedMigrationVersion = getExpectedDatabaseMigrationVersion();
    const appliedMigrationVersion =
      await getAppliedDatabaseMigrationVersion(readinessClient);

    if (appliedMigrationVersion !== expectedMigrationVersion) {
      throw new Error(
        `Database schema version mismatch: expected ${expectedMigrationVersion}, received ${
          appliedMigrationVersion === null
            ? "none"
            : String(appliedMigrationVersion)
        }`,
      );
    }
  } finally {
    await readinessClient.end().catch(() => undefined);
  }
};

export const isDatabaseReady = async (): Promise<boolean> => {
  try {
    await verifyDatabaseOperationalReadiness();

    return true;
  } catch {
    return false;
  }
};

export const closePool = async (): Promise<void> => {
  await pool.end();
};
