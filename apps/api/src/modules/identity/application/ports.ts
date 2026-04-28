import type {
  AuditContext,
  AuditEvent,
} from "../../../platform/audit/index.js";
import type { EmailMessage } from "../../../platform/email/index.js";

export interface LoginUserRecord {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  displayName: string | null;
  emailVerifiedAt: Date | null;
  isActive: boolean;
}

export interface LoginUserStateRecord {
  id: string;
  tenantId: string;
  email: string;
  displayName: string | null;
  emailVerifiedAt: Date | null;
  isActive: boolean;
}

export interface ActivePasswordResetUserRecord {
  id: string;
  tenantId: string;
  email: string;
}

export interface PasswordResetTokenRecord {
  tokenId: string;
  userId: string;
  tenantId: string;
  email: string;
  emailVerifiedAt: Date | null;
  isActive: boolean;
}

export interface SessionAuthRecord {
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

export interface InsertSessionParams {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface InsertSessionResult {
  sessionId: string;
}

export interface InsertPasswordResetTokenParams {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface InsertPasswordResetTokenResult {
  tokenId: string;
}

export interface UpdateUserPasswordParams {
  userId: string;
  passwordHash: string;
  emailVerifiedAt: Date;
  updatedAt: Date;
}

export interface LoginUserReader {
  findUserByEmail(email: string): Promise<LoginUserRecord | null>;
}

export interface UserStateReader {
  findUserStateById(userId: string): Promise<LoginUserStateRecord | null>;
}

export interface ActivePasswordResetUserReader {
  findActiveUserByEmail(
    email: string,
  ): Promise<ActivePasswordResetUserRecord | null>;
}

export interface SessionAuthReader {
  findSessionAuthByTokenHash(
    tokenHash: string,
  ): Promise<SessionAuthRecord | null>;
}

export interface SessionWriter {
  insertSession(params: InsertSessionParams): Promise<InsertSessionResult>;
  revokeSessionById(sessionId: string, revokedAt: Date): Promise<void>;
  revokeAllSessionsByUserId(userId: string, revokedAt: Date): Promise<void>;
}

export interface PasswordResetTokenReader {
  findValidPasswordResetTokenByTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<PasswordResetTokenRecord | null>;
}

export interface PasswordResetTokenWriter {
  invalidateActivePasswordResetTokens(
    userId: string,
    invalidatedAt: Date,
  ): Promise<void>;
  insertPasswordResetToken(
    params: InsertPasswordResetTokenParams,
  ): Promise<InsertPasswordResetTokenResult>;
  markPasswordResetTokenUsed(tokenId: string, usedAt: Date): Promise<boolean>;
}

export interface UserPasswordWriter {
  updateUserPassword(params: UpdateUserPasswordParams): Promise<void>;
}

export type IdentityTransaction = UserStateReader &
  SessionWriter &
  PasswordResetTokenWriter &
  UserPasswordWriter;

export interface IdentityTransactionRunner {
  transaction<TResult>(
    callback: (transaction: IdentityTransaction) => Promise<TResult>,
  ): Promise<TResult>;
}

export interface AuditRecorder {
  record(event: AuditEvent, auditContext: AuditContext): Promise<void>;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<unknown>;
}

export interface OpaqueTokenIssue {
  token: string;
  tokenHash: string;
}

export interface OpaqueTokenIssuer {
  issue(): OpaqueTokenIssue;
}

export interface OpaqueTokenHasher {
  hash(token: string): string;
}

export interface PasswordVerifier {
  verify(password: string, passwordHash: string): Promise<boolean>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
}
