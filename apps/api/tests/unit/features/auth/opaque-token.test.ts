import { describe, expect, it } from "vitest";

import { createOpaqueTokenService } from "../../../../src/auth/lib/opaque-token.js";

describe("createOpaqueTokenService", () => {
  it("generates base64url tokens and stable token hashes", () => {
    const service = createOpaqueTokenService({
      tokenByteLength: 16,
    });
    const token = service.generate();
    const tokenHash = service.hash(token);

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(service.hash(token)).toBe(tokenHash);
  });

  it("issues token/tokenHash pairs", () => {
    const service = createOpaqueTokenService({
      tokenByteLength: 16,
    });
    const issued = service.issue();

    expect(issued.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(issued.tokenHash).toBe(service.hash(issued.token));
    expect(issued.tokenHash).not.toBe(issued.token);
  });

  it("rejects invalid token byte lengths", () => {
    expect(() =>
      createOpaqueTokenService({
        tokenByteLength: 8,
      }),
    ).toThrow("tokenByteLength must be an integer greater than or equal to 16");
  });
});
