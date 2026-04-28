import type { RequestAuth } from "./request-auth.js";

interface AuthenticatedUserRecord {
  id: string;
  tenantId: string;
  email: string;
  displayName: string | null;
  emailVerifiedAt: Date | null;
}

interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  email: string;
  displayName: string | null;
  emailVerifiedAt: Date | null;
}

export const mapUserRecordToAuthenticatedUser = (
  user: AuthenticatedUserRecord,
): AuthenticatedUser => ({
  userId: user.id,
  tenantId: user.tenantId,
  email: user.email,
  displayName: user.displayName,
  emailVerifiedAt: user.emailVerifiedAt,
});

export const mapRequestAuthToAuthenticatedUser = (
  auth: RequestAuth,
): AuthenticatedUser => ({
  userId: auth.userId,
  tenantId: auth.tenantId,
  email: auth.email,
  displayName: auth.displayName,
  emailVerifiedAt: auth.emailVerifiedAt,
});

export type { AuthenticatedUser, AuthenticatedUserRecord };
