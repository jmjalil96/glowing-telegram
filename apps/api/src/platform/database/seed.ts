import { closePool, db } from "./client.js";
import { passwordHasher } from "../security/password-hasher.js";
import { env } from "../config/env.js";
import { tenantsTable, usersTable } from "./schema/auth.js";

const sharedSeedPassword = "Techbros123!";
const verifiedAt = new Date("2025-01-01T00:00:00.000Z");

const seedTenant = {
  name: "Techbros Dev",
  slug: "techbros-dev",
} as const;

const seedUsers = [
  {
    displayName: "Techbros Admin",
    email: "admin@techbros.local",
    emailVerifiedAt: verifiedAt,
    isActive: true,
    password: sharedSeedPassword,
  },
  {
    displayName: "Inactive User",
    email: "inactive@techbros.local",
    emailVerifiedAt: verifiedAt,
    isActive: false,
    password: sharedSeedPassword,
  },
] as const;

const run = async (): Promise<void> => {
  if (env.NODE_ENV === "production") {
    throw new Error("Refusing to run database seeds in production.");
  }

  await db.transaction(async (transaction) => {
    const now = new Date();
    const [tenant] = await transaction
      .insert(tenantsTable)
      .values({
        name: seedTenant.name,
        slug: seedTenant.slug,
      })
      .onConflictDoUpdate({
        set: {
          name: seedTenant.name,
          updatedAt: now,
        },
        target: tenantsTable.slug,
      })
      .returning({
        id: tenantsTable.id,
      });

    if (!tenant) {
      throw new Error("Failed to seed tenant.");
    }

    for (const seedUser of seedUsers) {
      const passwordHash = await passwordHasher.hash(seedUser.password);

      await transaction
        .insert(usersTable)
        .values({
          displayName: seedUser.displayName,
          email: seedUser.email,
          emailVerifiedAt: seedUser.emailVerifiedAt,
          isActive: seedUser.isActive,
          passwordHash,
          tenantId: tenant.id,
        })
        .onConflictDoUpdate({
          set: {
            displayName: seedUser.displayName,
            emailVerifiedAt: seedUser.emailVerifiedAt,
            isActive: seedUser.isActive,
            passwordHash,
            tenantId: tenant.id,
            updatedAt: now,
          },
          target: usersTable.email,
        });
    }
  });

  console.info("Seeded database successfully.");
  console.info(`Tenant: ${seedTenant.slug}`);
  console.info(`Password for seeded users: ${sharedSeedPassword}`);

  for (const seedUser of seedUsers) {
    const status = seedUser.isActive ? "active" : "inactive";
    console.info(`- ${seedUser.email} (${status})`);
  }
};

try {
  await run();
} finally {
  await closePool();
}
