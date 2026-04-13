import { describe, expect, it } from "vitest";

import { buildAuditContext } from "../../../../src/services/audit/context.js";

describe("buildAuditContext", () => {
  it("uses request identifiers and headers", () => {
    const context = buildAuditContext({
      requestId: "req-123",
      ip: "203.0.113.10",
      get: (name) => (name === "user-agent" ? "Vitest Agent" : undefined),
    });

    expect(context).toEqual({
      tenantId: null,
      actorUserId: null,
      requestId: "req-123",
      ipAddress: "203.0.113.10",
      userAgent: "Vitest Agent",
    });
  });

  it("allows tenant and actor overrides", () => {
    const context = buildAuditContext(
      {
        requestId: "req-456",
        ip: "198.51.100.5",
        get: () => undefined,
      },
      {
        tenantId: "tenant-123",
        actorUserId: "user-456",
      },
    );

    expect(context).toEqual({
      tenantId: "tenant-123",
      actorUserId: "user-456",
      requestId: "req-456",
      ipAddress: "198.51.100.5",
      userAgent: null,
    });
  });
});
