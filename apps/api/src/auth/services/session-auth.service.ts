import { eq } from "drizzle-orm";

import { db } from "../../db/client.js";
import { sessionsTable, usersTable } from "../../db/schema/auth.js";
import {
  opaqueTokenService,
  type OpaqueTokenService,
} from "../lib/opaque-token.js";
import type { RequestAuth } from "../types.js";

interface SessionAuthRecord {
  sessionId: string;
  userId: string;
  tenantId: string;
  email: string;
  displayName: string | null;
  emailVerifiedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
  isActive: boolean;
}

interface SessionAuthStore {
  findByTokenHash(tokenHash: string): Promise<SessionAuthRecord | null>;
}

interface SessionAuthService {
  resolveRequestAuth(rawSessionToken: string): Promise<RequestAuth | null>;
}

interface CreateSessionAuthServiceOptions {
  sessionAuthStore?: SessionAuthStore;
  opaqueTokenService?: Pick<OpaqueTokenService, "hash">;
  now?: () => Date;
}

const createSessionAuthStore = (): SessionAuthStore => ({
  findByTokenHash: async (tokenHash) => {
    const rows = await db
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
});

const mapRequestAuth = (record: SessionAuthRecord): RequestAuth => ({
  userId: record.userId,
  tenantId: record.tenantId,
  email: record.email,
  displayName: record.displayName,
  emailVerifiedAt: record.emailVerifiedAt,
  sessionId: record.sessionId,
});

export const createSessionAuthService = (
  options: CreateSessionAuthServiceOptions = {},
): SessionAuthService => {
  const authStore = options.sessionAuthStore ?? createSessionAuthStore();
  const authOpaqueTokenService =
    options.opaqueTokenService ?? opaqueTokenService;
  const now = options.now ?? (() => new Date());

  return {
    resolveRequestAuth: async (rawSessionToken) => {
      const tokenHash = authOpaqueTokenService.hash(rawSessionToken);
      const record = await authStore.findByTokenHash(tokenHash);

      if (!record) {
        return null;
      }

      if (record.revokedAt !== null) {
        return null;
      }

      if (record.expiresAt.getTime() <= now().getTime()) {
        return null;
      }

      if (!record.isActive) {
        return null;
      }

      return mapRequestAuth(record);
    },
  };
};

export type {
  CreateSessionAuthServiceOptions,
  SessionAuthRecord,
  SessionAuthService,
  SessionAuthStore,
};

export const sessionAuthService = createSessionAuthService();
