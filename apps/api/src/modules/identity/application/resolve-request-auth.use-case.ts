import type { RequestAuth } from "../domain/request-auth.js";
import type {
  OpaqueTokenHasher,
  SessionAuthReader,
  SessionAuthRecord,
} from "./ports.js";

interface SessionAuthService {
  resolveRequestAuth(rawSessionToken: string): Promise<RequestAuth | null>;
}

interface CreateSessionAuthServiceOptions {
  opaqueTokenHasher: OpaqueTokenHasher;
  sessionAuthReader: SessionAuthReader;
  now?: () => Date;
}

const mapRequestAuth = (record: SessionAuthRecord): RequestAuth => ({
  userId: record.userId,
  tenantId: record.tenantId,
  email: record.email,
  displayName: record.displayName,
  emailVerifiedAt: record.emailVerifiedAt,
  sessionId: record.sessionId,
});

export const createSessionAuthService = (
  options: CreateSessionAuthServiceOptions,
): SessionAuthService => {
  const sessionAuthReader = options.sessionAuthReader;
  const authOpaqueTokenHasher = options.opaqueTokenHasher;
  const now = options.now ?? (() => new Date());

  return {
    resolveRequestAuth: async (rawSessionToken) => {
      const tokenHash = authOpaqueTokenHasher.hash(rawSessionToken);
      const record =
        await sessionAuthReader.findSessionAuthByTokenHash(tokenHash);

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
  SessionAuthReader,
};
