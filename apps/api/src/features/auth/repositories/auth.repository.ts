import { and, eq, gt, isNull } from "drizzle-orm";

import { AUTH_PASSWORD_RESET_TOKEN_TYPE } from "../../../auth/constants.js";
import { db } from "../../../db/client.js";
import {
  sessionsTable,
  userTokensTable,
  usersTable,
} from "../../../db/schema/auth.js";

interface AuthLoginUserRecord {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  displayName: string | null;
  emailVerifiedAt: Date | null;
  isActive: boolean;
}

interface AuthLoginUserStateRecord {
  id: string;
  tenantId: string;
  email: string;
  displayName: string | null;
  emailVerifiedAt: Date | null;
  isActive: boolean;
}

interface ActivePasswordResetUserRecord {
  id: string;
  tenantId: string;
  email: string;
}

interface PasswordResetTokenRecord {
  tokenId: string;
  userId: string;
  tenantId: string;
  email: string;
  emailVerifiedAt: Date | null;
  isActive: boolean;
}

interface InsertSessionParams {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

interface InsertSessionResult {
  sessionId: string;
}

interface InsertPasswordResetTokenParams {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

interface InsertPasswordResetTokenResult {
  tokenId: string;
}

interface UpdateUserPasswordParams {
  userId: string;
  passwordHash: string;
  emailVerifiedAt: Date;
  updatedAt: Date;
}

interface AuthRepositoryTransaction {
  findUserStateById(userId: string): Promise<AuthLoginUserStateRecord | null>;
  insertSession(params: InsertSessionParams): Promise<InsertSessionResult>;
  revokeSessionById(sessionId: string, revokedAt: Date): Promise<void>;
  invalidateActivePasswordResetTokens(
    userId: string,
    invalidatedAt: Date,
  ): Promise<void>;
  insertPasswordResetToken(
    params: InsertPasswordResetTokenParams,
  ): Promise<InsertPasswordResetTokenResult>;
  markPasswordResetTokenUsed(tokenId: string, usedAt: Date): Promise<boolean>;
  updateUserPassword(params: UpdateUserPasswordParams): Promise<void>;
  revokeAllSessionsByUserId(userId: string, revokedAt: Date): Promise<void>;
}

interface AuthRepository {
  findUserByEmail(email: string): Promise<AuthLoginUserRecord | null>;
  findActiveUserByEmail(
    email: string,
  ): Promise<ActivePasswordResetUserRecord | null>;
  findValidPasswordResetTokenByTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<PasswordResetTokenRecord | null>;
  invalidateActivePasswordResetTokens(
    userId: string,
    invalidatedAt: Date,
  ): Promise<void>;
  insertPasswordResetToken(
    params: InsertPasswordResetTokenParams,
  ): Promise<InsertPasswordResetTokenResult>;
  markPasswordResetTokenUsed(tokenId: string, usedAt: Date): Promise<boolean>;
  revokeAllSessionsByUserId(userId: string, revokedAt: Date): Promise<void>;
  revokeSessionById(sessionId: string, revokedAt: Date): Promise<void>;
  transaction<TResult>(
    callback: (transaction: AuthRepositoryTransaction) => Promise<TResult>,
  ): Promise<TResult>;
}

interface CreateAuthRepositoryOptions {
  db?: typeof db;
}

export const createAuthRepository = (
  options: CreateAuthRepositoryOptions = {},
): AuthRepository => {
  const authDb = options.db ?? db;

  return {
    findUserByEmail: async (email) => {
      const rows = await authDb
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
    findActiveUserByEmail: async (email) => {
      const rows = await authDb
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
    findValidPasswordResetTokenByTokenHash: async (tokenHash, now) => {
      const rows = await authDb
        .select({
          tokenId: userTokensTable.id,
          userId: usersTable.id,
          tenantId: usersTable.tenantId,
          email: usersTable.email,
          emailVerifiedAt: usersTable.emailVerifiedAt,
          isActive: usersTable.isActive,
        })
        .from(userTokensTable)
        .innerJoin(usersTable, eq(userTokensTable.userId, usersTable.id))
        .where(
          and(
            eq(userTokensTable.tokenHash, tokenHash),
            eq(userTokensTable.type, AUTH_PASSWORD_RESET_TOKEN_TYPE),
            isNull(userTokensTable.usedAt),
            gt(userTokensTable.expiresAt, now),
          ),
        )
        .limit(1);

      return rows[0] ?? null;
    },
    invalidateActivePasswordResetTokens: async (userId, invalidatedAt) => {
      await authDb
        .update(userTokensTable)
        .set({
          usedAt: invalidatedAt,
        })
        .where(
          and(
            eq(userTokensTable.userId, userId),
            eq(userTokensTable.type, AUTH_PASSWORD_RESET_TOKEN_TYPE),
            isNull(userTokensTable.usedAt),
            gt(userTokensTable.expiresAt, invalidatedAt),
          ),
        );
    },
    insertPasswordResetToken: async ({ userId, tokenHash, expiresAt }) => {
      const rows = await authDb
        .insert(userTokensTable)
        .values({
          userId,
          tokenHash,
          type: AUTH_PASSWORD_RESET_TOKEN_TYPE,
          expiresAt,
        })
        .returning({
          tokenId: userTokensTable.id,
        });
      const passwordResetToken = rows[0];

      if (!passwordResetToken) {
        throw new Error("Failed to create password reset token");
      }

      return passwordResetToken;
    },
    markPasswordResetTokenUsed: async (tokenId, usedAt) => {
      const rows = await authDb
        .update(userTokensTable)
        .set({
          usedAt,
        })
        .where(
          and(eq(userTokensTable.id, tokenId), isNull(userTokensTable.usedAt)),
        )
        .returning({
          tokenId: userTokensTable.id,
        });

      return rows.length > 0;
    },
    revokeAllSessionsByUserId: async (userId, revokedAt) => {
      await authDb
        .update(sessionsTable)
        .set({
          revokedAt,
        })
        .where(
          and(
            eq(sessionsTable.userId, userId),
            isNull(sessionsTable.revokedAt),
          ),
        );
    },
    revokeSessionById: async (sessionId, revokedAt) => {
      await authDb
        .update(sessionsTable)
        .set({
          revokedAt,
        })
        .where(
          and(eq(sessionsTable.id, sessionId), isNull(sessionsTable.revokedAt)),
        );
    },
    transaction: async (callback) =>
      authDb.transaction(async (transactionDb) =>
        callback({
          findUserStateById: async (userId) => {
            const rows = await transactionDb
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
          insertSession: async ({ userId, tokenHash, expiresAt }) => {
            const rows = await transactionDb
              .insert(sessionsTable)
              .values({
                userId,
                tokenHash,
                expiresAt,
              })
              .returning({
                sessionId: sessionsTable.id,
              });
            const session = rows[0];

            if (!session) {
              throw new Error("Failed to create session");
            }

            return session;
          },
          revokeSessionById: async (sessionId, revokedAt) => {
            await transactionDb
              .update(sessionsTable)
              .set({
                revokedAt,
              })
              .where(
                and(
                  eq(sessionsTable.id, sessionId),
                  isNull(sessionsTable.revokedAt),
                ),
              );
          },
          invalidateActivePasswordResetTokens: async (
            userId,
            invalidatedAt,
          ) => {
            await transactionDb
              .update(userTokensTable)
              .set({
                usedAt: invalidatedAt,
              })
              .where(
                and(
                  eq(userTokensTable.userId, userId),
                  eq(userTokensTable.type, AUTH_PASSWORD_RESET_TOKEN_TYPE),
                  isNull(userTokensTable.usedAt),
                  gt(userTokensTable.expiresAt, invalidatedAt),
                ),
              );
          },
          insertPasswordResetToken: async ({
            userId,
            tokenHash,
            expiresAt,
          }) => {
            const rows = await transactionDb
              .insert(userTokensTable)
              .values({
                userId,
                tokenHash,
                type: AUTH_PASSWORD_RESET_TOKEN_TYPE,
                expiresAt,
              })
              .returning({
                tokenId: userTokensTable.id,
              });
            const passwordResetToken = rows[0];

            if (!passwordResetToken) {
              throw new Error("Failed to create password reset token");
            }

            return passwordResetToken;
          },
          markPasswordResetTokenUsed: async (tokenId, usedAt) => {
            const rows = await transactionDb
              .update(userTokensTable)
              .set({
                usedAt,
              })
              .where(
                and(
                  eq(userTokensTable.id, tokenId),
                  isNull(userTokensTable.usedAt),
                ),
              )
              .returning({
                tokenId: userTokensTable.id,
              });

            return rows.length > 0;
          },
          updateUserPassword: async ({
            userId,
            passwordHash,
            emailVerifiedAt,
            updatedAt,
          }) => {
            await transactionDb
              .update(usersTable)
              .set({
                passwordHash,
                emailVerifiedAt,
                updatedAt,
              })
              .where(eq(usersTable.id, userId));
          },
          revokeAllSessionsByUserId: async (userId, revokedAt) => {
            await transactionDb
              .update(sessionsTable)
              .set({
                revokedAt,
              })
              .where(
                and(
                  eq(sessionsTable.userId, userId),
                  isNull(sessionsTable.revokedAt),
                ),
              );
          },
        }),
      ),
  };
};

export type {
  ActivePasswordResetUserRecord,
  AuthLoginUserRecord,
  AuthLoginUserStateRecord,
  AuthRepository,
  AuthRepositoryTransaction,
  CreateAuthRepositoryOptions,
  InsertPasswordResetTokenParams,
  InsertPasswordResetTokenResult,
  InsertSessionParams,
  InsertSessionResult,
  PasswordResetTokenRecord,
  UpdateUserPasswordParams,
};

export const authRepository = createAuthRepository();
