import { describe, expect, it, vi } from "vitest";

import { createSessionAuthService } from "../../../src/auth/services/session-auth.service.js";

type CreateSessionAuthServiceOptions = NonNullable<
  Parameters<typeof createSessionAuthService>[0]
>;
type TestSessionAuthStore = NonNullable<
  CreateSessionAuthServiceOptions["sessionAuthStore"]
>;
type TestOpaqueTokenService = NonNullable<
  CreateSessionAuthServiceOptions["opaqueTokenService"]
>;

const fixedNow = new Date("2026-01-01T00:00:00.000Z");

const createOpaqueTokenService = (): {
  opaqueTokenService: TestOpaqueTokenService;
  hash: ReturnType<typeof vi.fn>;
} => {
  const hash = vi.fn().mockReturnValue("hashed-token");

  return {
    opaqueTokenService: {
      hash,
    },
    hash,
  };
};

const createRecord = (overrides: Record<string, unknown> = {}) => ({
  sessionId: "session-123",
  userId: "user-123",
  tenantId: "tenant-123",
  email: "hello@techbros.test",
  displayName: "Tech Bros",
  emailVerifiedAt: new Date("2025-12-31T00:00:00.000Z"),
  expiresAt: new Date("2026-01-02T00:00:00.000Z"),
  revokedAt: null,
  isActive: true,
  ...overrides,
});

describe("createSessionAuthService", () => {
  it("returns request auth for a valid joined session", async () => {
    const { opaqueTokenService, hash } = createOpaqueTokenService();
    const findByTokenHash = vi.fn().mockResolvedValue(createRecord());
    const sessionAuthStore: TestSessionAuthStore = {
      findByTokenHash,
    };
    const service = createSessionAuthService({
      sessionAuthStore,
      opaqueTokenService,
      now: () => fixedNow,
    });

    await expect(service.resolveRequestAuth("raw-token")).resolves.toEqual({
      userId: "user-123",
      tenantId: "tenant-123",
      email: "hello@techbros.test",
      displayName: "Tech Bros",
      emailVerifiedAt: new Date("2025-12-31T00:00:00.000Z"),
      sessionId: "session-123",
    });
    expect(hash).toHaveBeenCalledWith("raw-token");
    expect(findByTokenHash).toHaveBeenCalledWith("hashed-token");
  });

  it("returns null when the session does not exist", async () => {
    const service = createSessionAuthService({
      sessionAuthStore: {
        findByTokenHash: vi.fn().mockResolvedValue(null),
      },
      opaqueTokenService: createOpaqueTokenService().opaqueTokenService,
      now: () => fixedNow,
    });

    await expect(service.resolveRequestAuth("raw-token")).resolves.toBeNull();
  });

  it("returns null when the session is revoked", async () => {
    const service = createSessionAuthService({
      sessionAuthStore: {
        findByTokenHash: vi.fn().mockResolvedValue(
          createRecord({
            revokedAt: new Date("2025-12-31T12:00:00.000Z"),
          }),
        ),
      },
      opaqueTokenService: createOpaqueTokenService().opaqueTokenService,
      now: () => fixedNow,
    });

    await expect(service.resolveRequestAuth("raw-token")).resolves.toBeNull();
  });

  it("returns null when the session is expired", async () => {
    const service = createSessionAuthService({
      sessionAuthStore: {
        findByTokenHash: vi.fn().mockResolvedValue(
          createRecord({
            expiresAt: new Date("2026-01-01T00:00:00.000Z"),
          }),
        ),
      },
      opaqueTokenService: createOpaqueTokenService().opaqueTokenService,
      now: () => fixedNow,
    });

    await expect(service.resolveRequestAuth("raw-token")).resolves.toBeNull();
  });

  it("returns null when the user is inactive", async () => {
    const service = createSessionAuthService({
      sessionAuthStore: {
        findByTokenHash: vi.fn().mockResolvedValue(
          createRecord({
            isActive: false,
          }),
        ),
      },
      opaqueTokenService: createOpaqueTokenService().opaqueTokenService,
      now: () => fixedNow,
    });

    await expect(service.resolveRequestAuth("raw-token")).resolves.toBeNull();
  });

  it("rethrows store failures", async () => {
    const error = new Error("database unavailable");
    const service = createSessionAuthService({
      sessionAuthStore: {
        findByTokenHash: vi.fn().mockRejectedValue(error),
      },
      opaqueTokenService: createOpaqueTokenService().opaqueTokenService,
      now: () => fixedNow,
    });

    await expect(service.resolveRequestAuth("raw-token")).rejects.toBe(error);
  });
});
