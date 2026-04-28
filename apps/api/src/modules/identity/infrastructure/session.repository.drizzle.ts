import { and, eq, isNull } from "drizzle-orm";

import { db } from "../../../platform/database/client.js";
import {
  sessionsTable,
  usersTable,
} from "../../../platform/database/schema/auth.js";
import type {
  InsertSessionParams,
  SessionAuthReader,
  SessionWriter,
} from "../application/ports.js";
import type { IdentityDatabaseExecutor } from "./drizzle-executor.js";

type SessionRepository = SessionAuthReader & SessionWriter;

interface CreateSessionRepositoryOptions {
  db?: IdentityDatabaseExecutor;
}

export const createSessionRepository = (
  options: CreateSessionRepositoryOptions = {},
): SessionRepository => {
  const identityDb = options.db ?? db;

  return {
    findSessionAuthByTokenHash: async (tokenHash) => {
      const rows = await identityDb
        .select({
          sessionId: sessionsTable.id,
          userId: usersTable.id,
          tenantId: usersTable.tenantId,
          email: usersTable.email,
          displayName: usersTable.displayName,
          emailVerifiedAt: usersTable.emailVerifiedAt,
          expiresAt: sessionsTable.expiresAt,
          revokedAt: sessionsTable.revokedAt,
          isActive: usersTable.isActive,
        })
        .from(sessionsTable)
        .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
        .where(eq(sessionsTable.tokenHash, tokenHash))
        .limit(1);

      return rows[0] ?? null;
    },
    insertSession: async ({
      userId,
      tokenHash,
      expiresAt,
    }: InsertSessionParams) => {
      const rows = await identityDb
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
      await identityDb
        .update(sessionsTable)
        .set({
          revokedAt,
        })
        .where(
          and(eq(sessionsTable.id, sessionId), isNull(sessionsTable.revokedAt)),
        );
    },
    revokeAllSessionsByUserId: async (userId, revokedAt) => {
      await identityDb
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
  };
};

export type { CreateSessionRepositoryOptions, SessionRepository };
