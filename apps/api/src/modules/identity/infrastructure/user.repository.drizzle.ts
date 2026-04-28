import { and, eq } from "drizzle-orm";

import { db } from "../../../platform/database/client.js";
import { usersTable } from "../../../platform/database/schema/auth.js";
import type {
  ActivePasswordResetUserReader,
  LoginUserReader,
  UpdateUserPasswordParams,
  UserPasswordWriter,
  UserStateReader,
} from "../application/ports.js";
import type { IdentityDatabaseExecutor } from "./drizzle-executor.js";

type UserRepository = ActivePasswordResetUserReader &
  LoginUserReader &
  UserPasswordWriter &
  UserStateReader;

interface CreateUserRepositoryOptions {
  db?: IdentityDatabaseExecutor;
}

export const createUserRepository = (
  options: CreateUserRepositoryOptions = {},
): UserRepository => {
  const identityDb = options.db ?? db;

  return {
    findUserByEmail: async (email) => {
      const rows = await identityDb
        .select({
          id: usersTable.id,
          tenantId: usersTable.tenantId,
          email: usersTable.email,
          passwordHash: usersTable.passwordHash,
          displayName: usersTable.displayName,
          emailVerifiedAt: usersTable.emailVerifiedAt,
          isActive: usersTable.isActive,
        })
        .from(usersTable)
        .where(eq(usersTable.email, email))
        .limit(1);

      return rows[0] ?? null;
    },
    findUserStateById: async (userId) => {
      const rows = await identityDb
        .select({
          id: usersTable.id,
          tenantId: usersTable.tenantId,
          email: usersTable.email,
          displayName: usersTable.displayName,
          emailVerifiedAt: usersTable.emailVerifiedAt,
          isActive: usersTable.isActive,
        })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);

      return rows[0] ?? null;
    },
    findActiveUserByEmail: async (email) => {
      const rows = await identityDb
        .select({
          id: usersTable.id,
          tenantId: usersTable.tenantId,
          email: usersTable.email,
        })
        .from(usersTable)
        .where(and(eq(usersTable.email, email), eq(usersTable.isActive, true)))
        .limit(1);

      return rows[0] ?? null;
    },
    updateUserPassword: async ({
      userId,
      passwordHash,
      emailVerifiedAt,
      updatedAt,
    }: UpdateUserPasswordParams) => {
      await identityDb
        .update(usersTable)
        .set({
          passwordHash,
          emailVerifiedAt,
          updatedAt,
        })
        .where(eq(usersTable.id, userId));
    },
  };
};

export type { CreateUserRepositoryOptions, UserRepository };
