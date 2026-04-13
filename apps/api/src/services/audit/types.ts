export interface AuditEvent {
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AuditContext {
  tenantId?: string | null;
  actorUserId?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditContextOverrides {
  tenantId?: string | null;
  actorUserId?: string | null;
}

export interface RecordAuditOptions {
  strict?: boolean;
}
