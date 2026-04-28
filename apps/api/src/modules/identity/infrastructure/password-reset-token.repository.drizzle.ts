import { and, eq, gt, isNull } from "drizzle-orm";

import { db } from "../../../platform/database/client.js";
import {
  userTokensTable,
  usersTable,
} from "../../../platform/database/schema/auth.js";
import { AUTH_PASSWORD_RESET_TOKEN_TYPE } from "../domain/identity-constants.js";
import type {
  InsertPasswordResetTokenParams,
  PasswordResetTokenReader,
  PasswordResetTokenWriter,
} from "../application/ports.js";
import type { IdentityDatabaseExecutor } from "./drizzle-executor.js";

type PasswordResetTokenRepository = PasswordResetTokenReader &
  PasswordResetTokenWriter;

interface CreatePasswordResetTokenRepositoryOptions {
  db?: IdentityDatabaseExecutor;
}

export const createPasswordResetTokenRepository = (
  options: CreatePasswordResetTokenRepositoryOptions = {},
): PasswordResetTokenRepository => {
  const identityDb = options.db ?? db;

  return {
    findValidPasswordResetTokenByTokenHash: async (tokenHash, now) => {
      const rows = await identityDb
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
      await identityDb
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
    }: InsertPasswordResetTokenParams) => {
      const rows = await identityDb
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
      const rows = await identityDb
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
  };
};

export type {
  CreatePasswordResetTokenRepositoryOptions,
  PasswordResetTokenRepository,
};
