export interface RequestAuth {
  userId: string;
  tenantId: string;
  email: string;
  displayName: string | null;
  emailVerifiedAt: Date | null;
  sessionId: string;
}
