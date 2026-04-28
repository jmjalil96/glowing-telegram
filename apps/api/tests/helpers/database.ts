import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Pool } from "pg";
import { Pool as PgPool } from "pg";

import {
  AUTH_PASSWORD_RESET_TOKEN_TYPE,
  authConstants,
} from "../../src/modules/identity/domain/identity-constants.js";
import { opaqueTokenService } from "../../src/platform/security/opaque-token.js";
import { passwordHasher } from "../../src/platform/security/password-hasher.js";
import {
  sessionsTable,
  tenantsTable,
  userTokensTable,
  usersTable,
} from "../../src/platform/database/schema/auth.js";

const migrationsFolder = fileURLToPath(
  new URL("../../src/platform/database/migrations", import.meta.url),
);

export interface TestDatabase {
  connectionString: string;
  stop: () => Promise<void>;
}

export interface AuthFixtureUser {
  email: string;
  password: string;
}

export interface CreateAuthFixtureUserOptions {
  email?: string;
  password?: string;
  displayName?: string | null;
  tenantSlug?: string;
  tenantName?: string;
  isActive?: boolean;
  emailVerifiedAt?: Date | null;
}

export interface AuthFixtureUserRecord extends AuthFixtureUser {
  userId: string;
  tenantId: string;
  displayName: string | null;
  emailVerifiedAt: Date | null;
}

export interface SessionFixture {
  sessionId: string;
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface PasswordResetTokenFixture {
  tokenId: string;
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
}

export const httpContractAuthFixture = Object.freeze({
  email: "http-contract-user@techbros.local",
  password: "Techbros123!",
} satisfies AuthFixtureUser);

const defaultFixtureVerifiedAt = new Date("2025-01-01T00:00:00.000Z");

const resolveAuthFixtureOptions = (
  options: CreateAuthFixtureUserOptions = {},
): Required<
  Omit<CreateAuthFixtureUserOptions, "displayName" | "emailVerifiedAt">
> & {
  displayName: string | null;
  emailVerifiedAt: Date | null;
} => {
  const fixtureId = randomUUID();

  return {
    email: options.email ?? `auth-fixture-${fixtureId}@techbros.local`,
    password: options.password ?? httpContractAuthFixture.password,
    displayName:
      options.displayName === undefined
        ? "HTTP Contract User"
        : options.displayName,
    tenantSlug: options.tenantSlug ?? `auth-fixture-tenant-${fixtureId}`,
    tenantName: options.tenantName ?? "HTTP Contract Test Tenant",
    isActive: options.isActive ?? true,
    emailVerifiedAt:
      options.emailVerifiedAt === undefined
        ? defaultFixtureVerifiedAt
        : options.emailVerifiedAt,
  };
};

export const runMigrations = async (
  db: Parameters<typeof migrate>[0],
): Promise<void> => {
  await migrate(db, {
    migrationsFolder,
  });
};

export const truncateTables = async (
  pool: Pool,
  tableNames: string[],
): Promise<void> => {
  if (tableNames.length === 0) {
    return;
  }

  const tableList = tableNames.map((tableName) => {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      throw new Error(`Invalid table name: ${tableName}`);
    }

    return `"${tableName}"`;
  });

  await pool.query(
    `truncate table ${tableList.join(", ")} restart identity cascade`,
  );
};

export const runMigrationsForConnectionString = async (
  connectionString: string,
): Promise<void> => {
  const pool = new PgPool({
    connectionString,
  });
  const db = drizzle({
    client: pool,
  });

  try {
    await runMigrations(db);
  } finally {
    await pool.end();
  }
};

export const startTestDatabase = async (): Promise<TestDatabase> => {
  const container = await new PostgreSqlContainer("postgres:17")
    .withDatabase("techbros_api_test")
    .withUsername("postgres")
    .withPassword("postgres")
    .start();

  return {
    connectionString: container.getConnectionUri(),
    stop: async () => {
      await container.stop();
    },
  };
};

export const createAuthFixtureUser = async (
  connectionString: string,
  options: CreateAuthFixtureUserOptions = {},
): Promise<AuthFixtureUserRecord> => {
  const pool = new PgPool({
    connectionString,
  });
  const db = drizzle({
    client: pool,
    schema: {
      tenantsTable,
      usersTable,
    },
  });

  try {
    const fixture = resolveAuthFixtureOptions(options);
    const passwordHash = await passwordHasher.hash(fixture.password);
    const now = new Date();
    const [tenant] = await db
      .insert(tenantsTable)
      .values({
        slug: fixture.tenantSlug,
        name: fixture.tenantName,
        updatedAt: now,
      })
      .returning({
        id: tenantsTable.id,
      });

    if (!tenant) {
      throw new Error("Failed to create HTTP contract test tenant");
    }

    const [user] = await db
      .insert(usersTable)
      .values({
        tenantId: tenant.id,
        email: fixture.email,
        displayName: fixture.displayName,
        passwordHash,
        emailVerifiedAt: fixture.emailVerifiedAt,
        isActive: fixture.isActive,
        updatedAt: now,
      })
      .returning({
        userId: usersTable.id,
      });

    if (!user) {
      throw new Error("Failed to create HTTP contract test user");
    }

    return {
      userId: user.userId,
      tenantId: tenant.id,
      email: fixture.email,
      password: fixture.password,
      displayName: fixture.displayName,
      emailVerifiedAt: fixture.emailVerifiedAt,
    };
  } finally {
    await pool.end();
  }
};

export const createSessionFixture = async ({
  connectionString,
  userId,
  expiresAt,
}: {
  connectionString: string;
  userId: string;
  expiresAt: Date;
}): Promise<SessionFixture> => {
  const pool = new PgPool({
    connectionString,
  });
  const db = drizzle({
    client: pool,
    schema: {
      sessionsTable,
    },
  });

  try {
    const issuedToken = opaqueTokenService.issue();
    const [session] = await db
      .insert(sessionsTable)
      .values({
        userId,
        tokenHash: issuedToken.tokenHash,
        expiresAt,
      })
      .returning({
        sessionId: sessionsTable.id,
      });

    if (!session) {
      throw new Error("Failed to create auth session fixture");
    }

    return {
      sessionId: session.sessionId,
      rawToken: issuedToken.token,
      tokenHash: issuedToken.tokenHash,
      expiresAt,
    };
  } finally {
    await pool.end();
  }
};

export const createPasswordResetTokenFixture = async ({
  connectionString,
  userId,
  expiresAt = new Date(Date.now() + authConstants.passwordResetTokenTtlMs),
}: {
  connectionString: string;
  userId: string;
  expiresAt?: Date;
}): Promise<PasswordResetTokenFixture> => {
  const pool = new PgPool({
    connectionString,
  });
  const db = drizzle({
    client: pool,
    schema: {
      userTokensTable,
    },
  });

  try {
    const issuedToken = opaqueTokenService.issue();
    const [passwordResetToken] = await db
      .insert(userTokensTable)
      .values({
        userId,
        tokenHash: issuedToken.tokenHash,
        type: AUTH_PASSWORD_RESET_TOKEN_TYPE,
        expiresAt,
      })
      .returning({
        tokenId: userTokensTable.id,
      });

    if (!passwordResetToken) {
      throw new Error("Failed to create password reset token fixture");
    }

    return {
      tokenId: passwordResetToken.tokenId,
      rawToken: issuedToken.token,
      tokenHash: issuedToken.tokenHash,
      expiresAt,
    };
  } finally {
    await pool.end();
  }
};

export const updateUserActiveState = async ({
  connectionString,
  userId,
  isActive,
}: {
  connectionString: string;
  userId: string;
  isActive: boolean;
}): Promise<void> => {
  const pool = new PgPool({
    connectionString,
  });
  const db = drizzle({
    client: pool,
    schema: {
      usersTable,
    },
  });

  try {
    await db
      .update(usersTable)
      .set({
        isActive,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId));
  } finally {
    await pool.end();
  }
};
