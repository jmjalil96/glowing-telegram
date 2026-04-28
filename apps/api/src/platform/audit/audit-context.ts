import type { AuditContext, AuditContextOverrides } from "./audit.port.js";

const USER_AGENT_HEADER = "user-agent";

interface AuditRequest {
  requestId: string;
  ip?: string;
  get(name: string): string | undefined;
}

export const buildAuditContext = (
  req: AuditRequest,
  overrides: AuditContextOverrides = {},
): AuditContext => ({
  tenantId: overrides.tenantId ?? null,
  actorUserId: overrides.actorUserId ?? null,
  requestId: req.requestId,
  ipAddress: req.ip || null,
  userAgent: req.get(USER_AGENT_HEADER) ?? null,
});
